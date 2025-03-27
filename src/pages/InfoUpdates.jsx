import { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { db } from '../firebase';
import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  orderBy, 
  serverTimestamp, 
  doc, 
  updateDoc, 
  deleteDoc 
} from 'firebase/firestore';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

// MenuBar component for Tiptap formatting options
const MenuBar = ({ editor }) => {
  if (!editor) {
    return null;
  }

  return (
    <div className="menu-bar">
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={editor.isActive('bold') ? 'is-active' : ''}
      >
        מודגש
      </button>
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={editor.isActive('italic') ? 'is-active' : ''}
      >
        נטוי
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={editor.isActive('heading', { level: 2 }) ? 'is-active' : ''}
      >
        כותרת 2
      </button>
    </div>
  );
};

// New component for editing posts
const EditPostEditor = ({ post, onSave, onCancel }) => {
  const [editingTitle, setEditingTitle] = useState(post.title || '');
  const editor = useEditor({
    extensions: [StarterKit],
    content: post.body || post.content || '', // Load existing content
  });

  const handleSave = () => {
    if (!editingTitle.trim()) {
      alert('אנא הזן כותרת.');
      return;
    }
    if (!editor || !editor.getHTML().trim()) {
      alert('אנא הזן תוכן לפוסט.');
      return;
    }
    onSave(post.id, editingTitle, editor.getHTML());
  };

  return (
    <div className="post-form-container">
      <input
        type="text"
        value={editingTitle}
        onChange={(e) => setEditingTitle(e.target.value)}
        placeholder="כותרת"
        className="title-input"
      />
      <MenuBar editor={editor} />
      <div className="editor-container">
        <EditorContent editor={editor} />
      </div>
      <button onClick={handleSave}>שמור</button>
      <button onClick={onCancel}>ביטול</button>
    </div>
  );
};

function InfoUpdates() {
  const { userRole, userData } = useAuth();
  const [posts, setPosts] = useState([]);
  const [title, setTitle] = useState(''); // State for new post title
  const [isPinned, setIsPinned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingPostId, setEditingPostId] = useState(null);

  // Editor for creating new posts' body
  const editor = useEditor({
    extensions: [StarterKit],
    content: '',
  });

  // Fetch posts on component mount
  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    try {
      const q = query(collection(db, 'posts'), orderBy('pinned', 'desc'), orderBy('timestamp', 'desc'));
      const querySnapshot = await getDocs(q);
      const postsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPosts(postsData);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching posts:', err);
      setError('שגיאה בטעינת הפוסטים.');
      setLoading(false);
    }
  };

  // Handle creating a new post
  const handleSubmit = async () => {
    if (!userData || !userData.robloxNickname) {
      setError('שגיאה: נתוני המשתמש אינם זמינים.');
      return;
    }
    if (!title.trim()) {
      setError('אנא הזן כותרת.');
      return;
    }
    if (!editor || !editor.getHTML().trim()) {
      setError('אנא הזן תוכן לפוסט.');
      return;
    }
    try {
      await addDoc(collection(db, 'posts'), {
        title: title,
        body: editor.getHTML(),
        pinned: isPinned,
        username: userData.robloxNickname,
        timestamp: serverTimestamp(),
      });
      setTitle('');
      editor.commands.clearContent();
      setIsPinned(false);
      fetchPosts();
    } catch (err) {
      console.error('Error creating post:', err);
      setError('שגיאה ביצירת הפוסט.');
    }
  };

  // Start editing a post
  const startEditing = (postId) => {
    setEditingPostId(postId);
  };

  // Save edited post
  const saveEdit = async (postId, newTitle, newBody) => {
    try {
      const postRef = doc(db, 'posts', postId);
      await updateDoc(postRef, {
        title: newTitle,
        body: newBody,
      });
      setEditingPostId(null);
      fetchPosts();
    } catch (err) {
      console.error('Error updating post:', err);
      setError('שגיאה בעדכון הפוסט.');
    }
  };

  // Cancel editing
  const cancelEdit = () => {
    setEditingPostId(null);
  };

  // Delete a post
  const deletePost = async (postId) => {
    if (window.confirm('האם אתה בטוח שברצונך למחוק את הפוסט הזה?')) {
      try {
        const postRef = doc(db, 'posts', postId);
        await deleteDoc(postRef);
        fetchPosts();
      } catch (err) {
        console.error('Error deleting post:', err);
        setError('שגיאה במחיקת הפוסט.');
      }
    }
  };

  return (
    <div>
      <h1>מידע ועדכונים</h1>
      <div className="info-section">
        <h2>✨ ברוכים הבאים לאתר מוזהבים! ✨</h2>
        <h3>🤩 מה זה מוזהבים? 🤩</h3>
        <p>מוזהבים הם פריטים מיוחדים במשחק "בואו לכיף" (עולם הכיף) ברובלוקס! אפשר לקנות, למכור או להחליף אותם עם חברים. 🎮</p>
        <h3>🔮 איך יוצרים מוזהבים נדירים יותר? 🔮</h3>
        <p>רוצים מוזהב נדיר ומיוחד? שלבו 4 מוזהבים מאותו סוג ותקבלו מוזהב נדיר יותר:</p>
        <ul>
          <li>🟡 4 מוזהבים רגילים ➡️ מוזהב זהב</li>
          <li>💎 4 מוזהבי זהב ➡️ מוזהב יהלום</li>
          <li>💚 4 מוזהבי יהלום ➡️ מוזהב אמרלד</li>
        </ul>
        <p>כשתשלבו מוזהבים, הכמות שלהם במשחק יורדת והם הופכים לנדירים ושווים יותר! 🚀</p>
        <h3>📈 איך נקבע המחיר של מוזהבים? 📉</h3>
        <p>במשחק, כל אחד יכול להחליט לבד כמה שווה המוזהב שלו, וזה חלק מהכיף! באתר שלנו אנחנו לא מחליטים על המחיר לבד, אלא אוספים את המחירים שקבעו שחקנים אחרים בקהילת הדיסקורד ומציגים לכם את המחיר הממוצע. 💬</p>
        <p>אתם יכולים להצביע אם המחיר נראה לכם גבוה מדי ⬆️, נמוך מדי ⬇️ או בדיוק נכון! ✅</p>
        <h3>🎯 איך משתמשים באתר? 🎯</h3>
        <ol>
          <li>🔎 היכנסו לאתר וחפשו את המוזהב שתרצו לבדוק.</li>
          <li>💡 האתר יראה לכם מה המחיר הממוצע של המוזהב לפי הקהילה.</li>
          <li>👍👎 הצביעו על המחיר - גבוה מדי, נמוך מדי או הגיוני.</li>
          <li>🗃️ בקרוב תוכלו לנהל תיק אישי באתר כדי לעקוב אחרי האוסף שלכם והטריידים שעשיתם!</li>
        </ol>
        <h3>🚧 מה עוד בקרוב? 🚧</h3>
        <p>בקרוב תוכלו ליצור תיק אישי באתר, לעקוב אחרי כל המוזהבים שלכם, ולראות אם אתם ברווח או בהפסד! 📊</p>
        <h3>🎉 הקהילה שלנו 🎉</h3>
        <p>האתר שלנו גדל בזכותכם, קהילת עולם הכיף המדהימה! שתפו את החברים שלכם ועזרו לנו לגדול! 💖</p>
        <p>תהנו ותמשיכו לשחק בכיף!<br />איש הביטקוין 😊</p>
      </div>
      {userRole === 'admin' && userData && (
        <div className="admin-post-creation">
          <h2>צור פוסט חדש</h2>
          <div className="post-form-container">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="כותרת"
              className="title-input"
            />
            <MenuBar editor={editor} />
            <div className="editor-container">
              <EditorContent editor={editor} />
            </div>
            <label>
              <input type="checkbox" checked={isPinned} onChange={(e) => setIsPinned(e.target.checked)} />
              הצמד לפוסט
            </label>
            <button onClick={handleSubmit}>פרסם</button>
            {error && <p className="error">{error}</p>}
          </div>
        </div>
      )}
      <div className="posts">
        {loading ? (
          <p>טוען פוסטים...</p>
        ) : posts.length === 0 ? (
          <p>אין פוסטים זמינים כרגע.</p>
        ) : (
          posts.map(post => (
            <div key={post.id} className="post">
              {editingPostId === post.id ? (
                <EditPostEditor
                  post={post}
                  onSave={saveEdit}
                  onCancel={cancelEdit}
                />
              ) : (
                <>
                  <h1>{post.title || (post.content && 'פוסט ללא כותרת')}</h1>
                  <div dangerouslySetInnerHTML={{ __html: post.body || post.content }} />
                </>
              )}
              <p>פורסם ע"י: {post.username} ב-{post.timestamp?.toDate().toLocaleString('he-IL')}</p>
              {post.pinned && <span>📌 פוסט מוצמד</span>}
              {userRole === 'admin' && (
                <div>
                  {editingPostId !== post.id && (
                    <button onClick={() => startEditing(post.id)}>ערוך</button>
                  )}
                  <button onClick={() => deletePost(post.id)}>מחק</button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default InfoUpdates;