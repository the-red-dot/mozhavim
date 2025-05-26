// src/app/aitch/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useUser } from "../context/UserContext";
import { supabase } from "../lib/supabaseClient";
// TipTap imports:
import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import LinkTiptap from "@tiptap/extension-link"; // Renamed to avoid conflict with Next.js Link

// Define the Post type based on the posts table
type Post = {
  id: string;
  title: string;
  body: string;
  created_at: string;
};

export default function UpdatesPage() {
  const { user, profile, isLoading, sessionInitiallyChecked } = useUser();

  const [posts, setPosts] = useState<Post[]>([]);
  const [title, setTitle] = useState("");
  // Removed 'body' state, editor will manage its content directly.
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false); // For disabling buttons during operations

  // TipTap editor setup
  const editor: Editor | null = useEditor({ // Explicitly type editor as Editor | null
    extensions: [
        StarterKit, 
        Underline, 
        LinkTiptap.configure({ // Use the renamed import
            openOnClick: false, // Recommended for better UX
            autolink: true,
        })
    ],
    content: "", // Initial content is empty
    immediatelyRender: false, // Prevent immediate rendering during SSR
    // onUpdate can be used if needed, but we'll get HTML on submit.
  });

  // Sync editor content when starting to edit a post or clearing for a new one
  useEffect(() => {
    if (!editor) return;

    if (editingPost) {
      editor.commands.setContent(editingPost.body);
    } else {
      // When not editing (i.e., new post or after cancelling edit),
      // ensure editor is clear if it wasn't already.
      // editor.commands.clearContent(); // Or set to a default if preferred.
    }
  }, [editingPost, editor]);

  // Fetch posts
  useEffect(() => {
    // Fetch posts once the initial loading is done, or always if posts are public
    if (!isLoading && sessionInitiallyChecked) { // Example: fetch after user context is resolved
        fetchPosts();
    } else if (!isLoading && !user) { // Or if posts are public, fetch if not loading and no user
        fetchPosts();
    }
    // If posts are truly public and don't depend on user state at all for fetching,
    // you could fetch them earlier or with fewer conditions.
  }, [isLoading, sessionInitiallyChecked, user]); // Re-fetch if user state changes, e.g., after login

  const fetchPosts = async () => {
    const { data, error: fetchError } = await supabase
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false });

    if (fetchError) {
      console.error("Error fetching posts:", fetchError.message);
      setError("שגיאה בטעינת העדכונים.");
    } else {
      setPosts(data || []);
      setError(""); // Clear previous errors
    }
  };

  const handleCreatePost = async () => {
    if (!editor) return;
    const currentBody = editor.getHTML();
    if (!title.trim() || currentBody === "<p></p>" || !currentBody.trim()) { // Check for empty editor
      setError("חובה למלא כותרת ותוכן.");
      return;
    }
    if (!user || !profile?.is_admin) {
        setError("אינך מורשה לבצע פעולה זו.");
        return;
    }

    setIsSubmitting(true);
    setError("");
    const { error: insertError } = await supabase.from("posts").insert([{ title, body: currentBody, user_id: user.id }]); // Add user_id if your table has it
    if (insertError) {
      setError(insertError.message);
    } else {
      setTitle("");
      editor.commands.clearContent();
      fetchPosts(); // Refresh posts list
    }
    setIsSubmitting(false);
  };

  const handleUpdatePost = async () => {
    if (!editor || !editingPost) return;
    const currentBody = editor.getHTML();
     if (!title.trim() || currentBody === "<p></p>" || !currentBody.trim()) {
      setError("חובה למלא כותרת ותוכן.");
      return;
    }
     if (!user || !profile?.is_admin) {
        setError("אינך מורשה לבצע פעולה זו.");
        return;
    }

    setIsSubmitting(true);
    setError("");
    const { error: updateError } = await supabase
      .from("posts")
      .update({ title, body: currentBody })
      .eq("id", editingPost.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      setEditingPost(null);
      setTitle("");
      editor.commands.clearContent();
      fetchPosts(); // Refresh posts list
    }
    setIsSubmitting(false);
  };

  const handleDeletePost = async (postId: string) => {
    if (!user || !profile?.is_admin) {
        setError("אינך מורשה לבצע פעולה זו.");
        return;
    }
    const confirmed = window.confirm("האם אתה בטוח שברצונך למחוק עדכון זה?");
    if (!confirmed) return;

    setIsSubmitting(true);
    setError("");
    const { error: deleteError } = await supabase.from("posts").delete().eq("id", postId);
    if (deleteError) {
      setError(deleteError.message);
    } else {
      fetchPosts(); // Refresh posts list
      if (editingPost?.id === postId) { // If deleting the post being edited
        setEditingPost(null);
        setTitle("");
        editor?.commands.clearContent();
      }
    }
    setIsSubmitting(false);
  };

  const startEditing = (post: Post) => {
    if (!editor) return;
    setEditingPost(post);
    setTitle(post.title);
    editor.commands.setContent(post.body); // Set editor content
    setError(""); // Clear any previous errors
    window.scrollTo({ top: 0, behavior: 'smooth' }); // Scroll to top to see editor
  };

  const cancelEditing = () => {
    setEditingPost(null);
    setTitle("");
    editor?.commands.clearContent();
    setError("");
  }

  // UI Rendering
  if (isLoading) {
    return (
      <div className="info-updates-container" style={{ textAlign: 'center', paddingTop: '2rem' }}>
        <h1>עדכונים</h1>
        <p className="greeting" style={{ fontSize: '1.2rem', margin: '1rem 0' }}>טוען...</p>
      </div>
    );
  }

  // After isLoading is false
  return (
    <div className="info-updates-container">
      <h1>עדכונים</h1>

      <p className="greeting">
        {user && profile ? `שלום, ${profile.username}` 
          : (sessionInitiallyChecked ? "ברוכים הבאים" : "טוען...")}
      </p>

      {/* Admin Post Creation/Edit Form - Shown only if user is admin and context is loaded */}
      {!isLoading && sessionInitiallyChecked && user && profile?.is_admin && (
        <div className="admin-post-creation">
          <h2>{editingPost ? "עריכת עדכון" : "יצירת עדכון חדש"}</h2>
          <input
            type="text"
            placeholder="כותרת העדכון"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="title-input" // Ensure styling in globals.css
            disabled={isSubmitting}
          />

          {editor && <EditorContent editor={editor} className="body-input" />} 
          {/* Ensure .body-input and TipTap's .ProseMirror are styled in globals.css */}
          
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-start' }}>
            <button onClick={editingPost ? handleUpdatePost : handleCreatePost} disabled={isSubmitting || !editor}>
              {isSubmitting ? (editingPost ? "מעדכן..." : "מפרסם...") : (editingPost ? "עדכן" : "פרסם")}
            </button>
            {editingPost && (
              <button onClick={cancelEditing} disabled={isSubmitting} style={{backgroundColor: '#6c757d'}}>
                בטל עריכה
              </button>
            )}
          </div>
          {error && <p className="error" style={{marginTop: '0.5rem', color: '#FF6B6B'}}>{error}</p>}
        </div>
      )}

      {/* Post List - Accessible to All Users */}
      <div className="posts">
        {!sessionInitiallyChecked && posts.length === 0 && <p>טוען עדכונים...</p>}
        {sessionInitiallyChecked && posts.length === 0 && <p>אין עדכונים זמינים כרגע.</p>}
        
        {posts.map((post) => (
          <div key={post.id} className="post">
            <h1>{post.title}</h1>
            <div dangerouslySetInnerHTML={{ __html: post.body }} />
            <p style={{fontSize: '0.8rem', color: '#aaa', marginTop: '0.5rem'}}>
                פורסם ב: {new Date(post.created_at).toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
            {!isLoading && sessionInitiallyChecked && user && profile?.is_admin && (
              <div style={{marginTop: '1rem', display: 'flex', gap: '0.5rem'}}>
                <button onClick={() => startEditing(post)} disabled={isSubmitting}>ערוך</button>
                <button onClick={() => handleDeletePost(post.id)} disabled={isSubmitting} style={{backgroundColor: '#dc3545'}}>מחק</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}