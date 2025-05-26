// src/app/page.tsx
import SearchComponent from "./components/SearchComponent";
// Import DepreciationSummary types, but the component itself will be rendered by SearchComponent
import { DepreciationStatsDisplay, StatsSourceType } from "./components/DepreciationSummary"; 
import { fetchAndManageDepreciationStats, getSearchComponentItems, Item as DepreciationItem } from "./lib/depreciationService";

export default async function Home() {
  console.log("Home: Page load initiated.");

  const { 
    data: generalDepreciationDataRaw, 
    source: generalStatsSource, 
    itemFetchError: depreciationServiceItemFetchError 
  } = await fetchAndManageDepreciationStats();

  const { items: searchComponentItems, error: searchItemsError } = await getSearchComponentItems();

  const pageDisplayError = searchItemsError || depreciationServiceItemFetchError;

  if (searchItemsError && !searchComponentItems?.length) {
    console.error("Home: Critical error fetching items for SearchComponent:", searchItemsError);
    return (
        <div className="page-container" style={{ textAlign: 'center', paddingTop: '50px' }}>
            <h1>שגיאה</h1>
            <p>אירעה שגיאה בטעינת נתוני הפריטים. נסו לרענן את הדף.</p>
            <pre style={{ fontSize: '0.8em', color: 'grey' }}>{searchItemsError}</pre>
        </div>
    );
  }
  
  const safeItems = searchComponentItems || [];
  console.log("Home: Received", safeItems.length, "items for SearchComponent.");

  // It's crucial that generalDepreciationDataRaw is an object with the expected fields
  // The depreciationService is designed to return defaultInitialStatsData if other fetches fail,
  // so generalDepreciationDataRaw should always be an object.
  const generalDisplayStats: DepreciationStatsDisplay = {
    total_items_from_source: generalDepreciationDataRaw.total_items_from_source,
    items_with_valid_regular_price: generalDepreciationDataRaw.items_with_valid_regular_price,
    average_gold_depreciation: generalDepreciationDataRaw.average_gold_depreciation,
    gold_items_count: generalDepreciationDataRaw.gold_items_count,
    average_diamond_depreciation: generalDepreciationDataRaw.average_diamond_depreciation,
    diamond_items_count: generalDepreciationDataRaw.diamond_items_count,
    average_emerald_depreciation: generalDepreciationDataRaw.average_emerald_depreciation,
    emerald_items_count: generalDepreciationDataRaw.emerald_items_count,
    updated_at: 'updated_at' in generalDepreciationDataRaw ? generalDepreciationDataRaw.updated_at : undefined,
  };

  return (
    <div className="page-container">
      <h1 className="title">
        <span className="title-letter-blue">מ</span>
        <span className="title-letter-red">ו</span>
        <span className="title-letter-yellow">ז</span>
        <span className="title-letter-blue">ה</span>
        <span className="title-letter-green">ב</span>
        <span className="title-letter-red">י</span>
        <span className="title-letter-yellow">ם</span>
      </h1>
      <SearchComponent 
        initialItems={safeItems as DepreciationItem[]} 
        generalDepreciationStats={generalDisplayStats} // This should be a valid object
        generalDepreciationSource={generalStatsSource} // This should be a valid string
      />
    </div>
  );
}
