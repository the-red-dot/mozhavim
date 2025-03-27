import { useState } from 'react';
import { db } from '../firebase';
import { collection, addDoc, getDocs } from 'firebase/firestore';

function AdminSection() {
  const [textInput, setTextInput] = useState('');
  const [status, setStatus] = useState('');

  const PUBLISHER_REGEX = /^(.+?)\s*[—–-]\s*(\d{1,2}\/\d{1,2}\/\d{2,4}\s*[,;]?\s*\d{1,2}:\d{2}\s*(?:AM|PM)?)/i;
  const stateMap = {
    'רגיל': 'Regular',
    'זהב': 'Gold',
    'יהלום': 'Diamond',
    'אמרלד': 'Emerald'
  };

  const parsePriceLine = (line, isBuy, currentItem) => {
    if (line.includes("פופולריות")) {
      line = line.split("פופולריות")[0].trim();
    }

    const emeraldRegex = /אמרלד\s*[;:|-]?\s*([^,|]+)/i;
    const emeraldMatch = line.match(emeraldRegex);
    if (emeraldMatch) {
      const text = emeraldMatch[1].trim();
      if (isBuy) currentItem.buyEmerald = text;
      else currentItem.sellEmerald = text;
    }
    line = line.replace(emeraldRegex, "").trim();

    const pattern = /עד\s+([^,|]+?)\s*במצב\s+(רגיל|זהב|יהלום)/gi;
    let anyStateFound = false;
    let match;
    while ((match = pattern.exec(line)) !== null) {
      anyStateFound = true;
      const rawPrice = match[1].trim();
      const rawState = match[2].trim();
      const fieldSuffix = stateMap[rawState];
      if (fieldSuffix) {
        if (isBuy) {
          currentItem[`buy${fieldSuffix}`] = rawPrice;
        } else {
          currentItem[`sell${fieldSuffix}`] = rawPrice;
        }
      }
    }

    if (!anyStateFound) {
      const singleNum = line.match(/(\d+(?:\.\d+)?)/);
      if (singleNum) {
        const numericValue = singleNum[1];
        if (isBuy) {
          currentItem.buyRegular = numericValue;
        } else {
          currentItem.sellRegular = numericValue;
        }
      }
    }
  };

  const parseTabularLine = (line) => {
    if (line.match(/מחיר\s*מומלץ\s*[לקנייהלמכירה]\s*[;:|-]/i)) {
      return null;
    }
    if (line.includes("פופולריות")) {
      const [itemPart] = line.split("פופולריות");
      const trimmedItemPart = itemPart.trim();
      const match = trimmedItemPart.match(/^(.+?)\s*[-\s]\s*(\d+(?:[\/-]\d+)?\+?)/i);
      if (match) {
        const itemName = match[1].trim();
        let priceStr = match[2].trim();
        const rangeMatch = priceStr.match(/^(\d+)[\/-](\d+)$/);
        if (rangeMatch) {
          const min = parseFloat(rangeMatch[1]);
          const max = parseFloat(rangeMatch[2]);
          priceStr = ((min + max) / 2).toFixed(1);
        } else if (priceStr.endsWith("+")) {
          priceStr = priceStr.replace("+", "").trim();
        }
        return {
          name: itemName,
          buyRegular: priceStr
        };
      }
    }
    return null;
  };

  const parseStructuredData = (block) => {
    const lines = block.split('\n').map(line => line.trim()).filter(Boolean);
    let item = {
      name: null,
      buyRegular: null,
      buyGold: null,
      buyDiamond: null,
      buyEmerald: null,
      sellRegular: null,
      sellGold: null,
      sellDiamond: null,
      sellEmerald: null,
      publisher: null,
      date: null
    };

    // Simplified field regex to match key-value pairs more flexibly
    const fieldRegex = {
      name: /^(?:שם\s*מוזהב)\s*[:;-]?\s*(.+)/i,
      buyRegular: /^(?:קנייה\s*\(?\s*רגיל\s*\)?)\s*[:;-]?\s*(.+)/i,
      buyGold: /^(?:קנייה\s*\(?\s*זהב\s*\)?)\s*[:;-]?\s*(.+)/i,
      buyDiamond: /^(?:קנייה\s*\(?\s*יהלום\s*\)?)\s*[:;-]?\s*(.+)/i,
      buyEmerald: /^(?:קנייה\s*\(?\s*אמרלד\s*\)?)\s*[:;-]?\s*(.+)/i,
      sellRegular: /^(?:מכירה\s*\(?\s*רגיל\s*\)?)\s*[:;-]?\s*(.+)/i,
      sellGold: /^(?:מכירה\s*\(?\s*זהב\s*\)?)\s*[:;-]?\s*(.+)/i,
      sellDiamond: /^(?:מכירה\s*\(?\s*יהלום\s*\)?)\s*[:;-]?\s*(.+)/i,
      sellEmerald: /^(?:מכירה\s*\(?\s*אמרלד\s*\)?)\s*[:;-]?\s*(.+)/i,
      publisher: /^(?:פורסם\s*ע["״]?\s*י)\s*[:;-]?\s*(.+)/i,
      date: /^(?:תאריך\s*פרסום)\s*[:;-]?\s*(.+)/i
    };

    // Accumulate all fields into one item
    for (const line of lines) {
      for (const [key, regex] of Object.entries(fieldRegex)) {
        const match = line.match(regex);
        if (match) {
          const value = match[1].trim();
          if (key.startsWith('buy') || key.startsWith('sell')) {
            if (value !== "אין נתון" && value !== "אין") {
              item[key] = value;
            }
          } else {
            item[key] = value;
          }
          break; // Move to next line after matching
        }
      }
    }

    console.log("Parsed Item:", item);

    // Validate: Must have name and at least one price
    if (item.name && (item.buyRegular || item.buyGold || item.buyDiamond || item.buyEmerald || 
                      item.sellRegular || item.sellGold || item.sellDiamond || item.sellEmerald)) {
      return item;
    }
    console.log("Item not added: missing required fields or invalid data");
    return null;
  };

  const handleSubmit = async () => {
    if (!textInput.trim()) {
      setStatus('אנא הזן טקסט.');
      return;
    }

    try {
      // Treat the entire input as a single block initially
      const structuredItem = parseStructuredData(textInput);
      const parsedData = [];

      if (structuredItem) {
        parsedData.push(structuredItem);
      } else {
        // Fallback to block splitting if structured parsing fails
        const blocks = textInput.split(/\n{2,}/).map(block => block.trim()).filter(Boolean);
        for (const block of blocks) {
          const blockItem = parseStructuredData(block);
          if (blockItem) {
            parsedData.push(blockItem);
          } else {
            // Line-by-line parsing as a last resort
            const lines = block.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
            let currentPublisher = null;
            let currentDate = null;
            let currentItem = null;

            const finalizeCurrentItem = () => {
              if (currentItem && currentItem.name) {
                parsedData.push({
                  name: currentItem.name,
                  buyRegular: currentItem.buyRegular || null,
                  buyGold: currentItem.buyGold || null,
                  buyDiamond: currentItem.buyDiamond || null,
                  buyEmerald: currentItem.buyEmerald || null,
                  sellRegular: currentItem.sellRegular || null,
                  sellGold: currentItem.sellGold || null,
                  sellDiamond: currentItem.sellDiamond || null,
                  sellEmerald: currentItem.sellEmerald || null,
                  publisher: currentItem.publisher,
                  date: currentItem.date
                });
              }
              currentItem = null;
            };

            for (const line of lines) {
              const pubMatch = line.match(PUBLISHER_REGEX);
              if (pubMatch) {
                finalizeCurrentItem();
                currentPublisher = pubMatch[1].trim();
                currentDate = pubMatch[2].trim();
                continue;
              }

              if (!currentPublisher || !currentDate) {
                continue;
              }

              if (line.match(/שם\s*ה?מוזהב\s*[:;-]/i)) {
                finalizeCurrentItem();
                let base = line.split("פופולריות")[0].trim();
                base = base.replace(/שם\s*ה?מוזהב\s*[:;-]/i, "").trim();
                base = base.replace(/[:;|-]\S*?[:;|-]/g, "").trim();

                let buyVal = null;
                const rangeRegex = /(\d+)[/\-](\d+)/;
                const rangeMatch = base.match(rangeRegex);
                if (rangeMatch) {
                  const v1 = parseFloat(rangeMatch[1]);
                  const v2 = parseFloat(rangeMatch[2]);
                  const avg = ((v1 + v2) / 2).toFixed(1);
                  buyVal = avg;
                  base = base.replace(rangeRegex, "").replace(/[-,\s]+/, "").trim();
                }

                currentItem = {
                  name: base,
                  buyRegular: buyVal,
                  buyGold: null,
                  buyDiamond: null,
                  buyEmerald: null,
                  sellRegular: null,
                  sellGold: null,
                  sellDiamond: null,
                  sellEmerald: null,
                  publisher: currentPublisher,
                  date: currentDate
                };
                continue;
              }

              if (line.match(/מחיר\s*מומלץ\s*לקנייה\s*[:;-]/i) && currentItem) {
                parsePriceLine(line.replace(/מחיר\s*מומלץ\s*לקנייה\s*[:;-]/i, "").trim(), true, currentItem);
                continue;
              }

              if (line.match(/מחיר\s*מומלץ\s*למכירה\s*[:;-]/i) && currentItem) {
                parsePriceLine(line.replace(/מחיר\s*מומלץ\s*למכירה\s*[:;-]/i, "").trim(), false, currentItem);
                continue;
              }

              if (!currentItem) {
                const tabResult = parseTabularLine(line);
                if (tabResult) {
                  parsedData.push({
                    name: tabResult.name,
                    buyRegular: tabResult.buyRegular,
                    buyGold: null,
                    buyDiamond: null,
                    buyEmerald: null,
                    sellRegular: null,
                    sellGold: null,
                    sellDiamond: null,
                    sellEmerald: null,
                    publisher: currentPublisher,
                    date: currentDate
                  });
                  continue;
                }
              }
            }

            finalizeCurrentItem();
          }
        }
      }

      const existingItemsSnapshot = await getDocs(collection(db, 'items'));
      const existingItems = existingItemsSnapshot.docs.map(doc => doc.data());
      const seen = new Set(existingItems.map(item => `${item.name}||${item.publisher}||${item.date}`));
      const uniqueData = [];

      for (const item of parsedData) {
        const key = `${item.name}||${item.publisher}||${item.date}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueData.push(item);
        }
      }

      for (const item of uniqueData) {
        await addDoc(collection(db, 'items'), item);
      }

      setStatus('הנתונים נשמרו בהצלחה!');
      setTextInput('');
    } catch (err) {
      console.error(err);
      setStatus('שגיאה בשמירת הנתונים.');
    }
  };

  return (
    <div className="admin-section">
      <h2>ניהול - הוספת נתוני מחירים</h2>
      <p>הדבק את הטקסט כאן:</p>
      <textarea
        rows="10"
        cols="50"
        value={textInput}
        onChange={(e) => setTextInput(e.target.value)}
        placeholder="הדבק כאן את נתוני המחירים..."
      />
      <br />
      <button onClick={handleSubmit}>שלח</button>
      <div className="status">{status}</div>
    </div>
  );
}

export default AdminSection;