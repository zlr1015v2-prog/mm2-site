import { useEffect, useMemo, useState, useRef } from "react";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  deleteDoc,
  doc,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBhiXv8i-TFfPKbRkEpTTVGBTk03YxwS4Q",
  authDomain: "mm2-site.firebaseapp.com",
  projectId: "mm2-site",
  storageBucket: "mm2-site.firebasestorage.app",
  messagingSenderId: "894810172966",
  appId: "1:894810172966:web:c6714ec1d07a1d912580e7",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getFirestore(app);

const weaponImages = import.meta.glob(
  "/src/assets/weapons/*",
  { eager: true, import: "default" }
);

function normalizeWeaponName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/chroma\s+/g, "chroma")
    .replace(/\s+ii/g, "2")
    .replace(/\s+iv/g, "4")
    .replace(/['\s-]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function getLocalWeaponImage(name) {
  const target = normalizeWeaponName(name);
  const entry = Object.entries(weaponImages).find(([path]) => {
    const parts = path.split("/");
    let file = parts[parts.length - 1];
    file = file.replace(/\.(png|jpg|jpeg|webp)$/i, "");
    file = file.replace(/\.(png|jpg|jpeg|webp)$/i, "");
    return normalizeWeaponName(file) === target;
  });
  return entry ? entry[1] : "";
}

// USD to Robux: $1 = 80 Robux, tripled = 240 Robux per $1
const USD_TO_ROBUX = 240;

function usdToRobux(usd) {
  return Math.round(usd * USD_TO_ROBUX);
}

function formatRobux(amount) {
  return Math.round(amount).toLocaleString("en-US");
}

// Preset price suggestions in Robux (no decimals)
const ROBUX_PRESETS = [
  { label: "3,000 R$", value: 3000 },
  { label: "5,000 R$", value: 5000 },
  { label: "10,000 R$", value: 10000 },
  { label: "25,000 R$", value: 25000 },
  { label: "50,000 R$", value: 50000 },
  { label: "100,000 R$", value: 100000 },
];

const ALL_MM2_ITEMS = [
  "America", "Amerilaser", "Australis", "Bat", "Battleaxe", "Battleaxe2",
  "Batwing", "Bauble", "Bioblade", "Blaster", "Blood", "Bloom", "Blossom",
  "Blueseer", "Boneblade", "Borealis", "Candleflame", "Candy", "Celestial",
  "Chill", "Chromabau", "Chromaboneblade", "Chromacandle", "Chromaconstellation",
  "Chromacookiecane", "Chromadarkbringer", "Chromadeathshard", "Chromaelderwoodblade",
  "Chromaevergreen", "Chromafangun", "Chromagemstone", "Chromagingerbladegun",
  "Chromaheat", "Chromalasergun", "Chromalightbringer", "Chromaluger",
  "Chromasaw", "Chromaseer", "Chromashark", "Chromaslasher", "Chromasunrise",
  "Chromasunset", "Chromaswirlgun", "Chromatides", "Chromatravelergun",
  "Chromavampires", "Chromawatergun", "Clockwork", "Cookieblade", "Cookiecane",
  "Cowboy", "Darkbringer", "Darkshot", "Darksword", "Deathshard", "Eggblade",
  "Elderwood Scythe", "Elderwood Revolver", "Elderwood Gun", "Eternal",
  "Eternalcane", "Eternalii", "Eternaliv", "Evergreen", "Evergun", "Fang",
  "Flames", "Flora", "Flowerwood", "Flowerwoodgun", "Frostbite", "Frostsaber",
  "Gemstone", "Ghost", "Ghostblade", "Gingerblade", "Gingerluger", "Gingermint",
  "Gingerscope", "Golden", "Greenluger", "Hallowgun", "Hallowblade",
  "Hallowscythe", "Hallowedge", "Handsaw", "Harvester", "Heartblade", "Heat",
  "Icebeam", "Iceblaster", "Icebreaker", "Icedragon", "Iceflake", "Icepiercer",
  "Iceshard", "Icewing", "Jinglegun", "Laser", "Lightbringer", "Logchopper",
  "Luger", "Lugercane", "Makeshift", "Minty", "Nebula", "Nightblade", "Ocean",
  "Oldglory", "Orangeseer", "Pearl", "Pearlshine", "Peppermint", "Phantom",
  "Phaser", "Pixel", "Plasmabeam", "Plasmablade", "Prince", "Prismatic",
  "Pumpking", "Purpleseer", "Rainbow", "Rainbowgun", "Redluger", "Redseer",
  "Sakura", "Saw", "Seer", "Shadow", "Shark", "Slasher", "Snowflake", "Soul",
  "Spectre", "Spider", "Spirit", "Splitter", "Sugar", "Sunrise", "Sunset",
  "Swirlyaxe", "Swirlyblade", "Swirlygun", "Tides", "Travelersaxe",
  "Travelersgun", "Turkey", "Vampiresaxe", "Vampiresedge", "Vampiresgun",
  "Virtual", "Watergun", "Waves", "Wintersedge", "Xmas", "Yellowseer",
].sort();

const VERIFIED_MIDDLEMAN = {
  robloxId: "9754148025",
  robloxName: "Middleman",
  robloxProfile: "https://www.roblox.com/users/9754148025/profile",
  trustScore: 100,
  completedTrades: 500,
};

const GAMEPASS_REGEX = /^https:\/\/www\.roblox\.com\/game-pass\/\d+\/[^/]+\/?$/;

function validateGamepassUrl(url) {
  return GAMEPASS_REGEX.test(url.trim());
}

export default function MM2MarketplaceMockup() {
  // askingRobux = luger.gg sale price × 3 × 80 Robux/USD, rounded to whole number
  const items = [
    { name: "Harvester", category: "Ancient", rarityScore: 10, demand: 9, stability: "Stable", origin: "Halloween Event", stock: 1, seller: "ShadowTrader", askingRobux: 1788, valueLabel: "", image: "" },
    { name: "Icepiercer", category: "Ancient", rarityScore: 10, demand: 9, stability: "Stable", origin: "Christmas Event", stock: 1, seller: "FrostVault", askingRobux: 1572, valueLabel: "", image: "" },
    { name: "Corrupt", category: "Unique", rarityScore: 10, demand: 10, stability: "Rising", origin: "Classic Event", stock: 1, seller: "VantaShop", askingRobux: 7200, valueLabel: "", image: "" },
    { name: "Chroma Darkbringer", category: "Chroma", rarityScore: 9, demand: 8, stability: "Stable", origin: "Mystery Box", stock: 1, seller: "PrismSeller", askingRobux: 1094, valueLabel: "", image: "" },
    { name: "Elderwood Scythe", category: "Ancient", rarityScore: 9, demand: 8, stability: "Stable", origin: "Halloween Event", stock: 2, seller: "OakVault", askingRobux: 1366, valueLabel: "", image: "" },
    { name: "Batwing", category: "Ancient", rarityScore: 8, demand: 7, stability: "Stable", origin: "Halloween Event", stock: 2, seller: "EchoInventory", askingRobux: 545, valueLabel: "", image: "" },
    { name: "Darkbringer", category: "Godly", rarityScore: 8, demand: 7, stability: "Stable", origin: "Mystery Box", stock: 2, seller: "NightDeals", askingRobux: 274, valueLabel: "", image: "" },
    { name: "Lightbringer", category: "Godly", rarityScore: 8, demand: 7, stability: "Stable", origin: "Mystery Box", stock: 2, seller: "GlowTrades", askingRobux: 341, valueLabel: "", image: "" },
    { name: "Luger", category: "Godly", rarityScore: 7, demand: 6, stability: "Stable", origin: "Christmas Event", stock: 4, seller: "QuickFlipz", askingRobux: 362, valueLabel: "", image: "" },
    { name: "Laser", category: "Vintage", rarityScore: 7, demand: 6, stability: "Fluctuating", origin: "Classic", stock: 3, seller: "RetroMM2", askingRobux: 240, valueLabel: "", image: "" },
    { name: "Gemstone", category: "Godly", rarityScore: 6, demand: 5, stability: "Stable", origin: "Shop", stock: 5, seller: "GemHub", askingRobux: 202, valueLabel: "", image: "" },
    { name: "Heartblade", category: "Godly", rarityScore: 6, demand: 6, stability: "Rising", origin: "Shop", stock: 6, seller: "PinkVault", askingRobux: 559, valueLabel: "", image: "" },
    { name: "Seer", category: "Godly", rarityScore: 3, demand: 3, stability: "Stable", origin: "Crafting", stock: 12, seller: "BaseTradez", askingRobux: 137, valueLabel: "", image: "" },
    { name: "Gingerscope", category: "Ancient", rarityScore: 10, demand: 10, stability: "Rising", origin: "Christmas Event", stock: 1, seller: "ScopeVault", askingRobux: 2400, valueLabel: "", image: "" },
    { name: "Vampire's Axe", category: "Ancient", rarityScore: 9, demand: 9, stability: "Stable", origin: "Halloween Event", stock: 1, seller: "CrimsonDeals", askingRobux: 1024, valueLabel: "", image: "" },
    { name: "Swirly Axe", category: "Ancient", rarityScore: 9, demand: 8, stability: "Rising", origin: "Christmas Event", stock: 2, seller: "CandyCore", askingRobux: 816, valueLabel: "", image: "" },
    { name: "Swirly Gun", category: "Godly", rarityScore: 9, demand: 8, stability: "Rising", origin: "Christmas Event", stock: 2, seller: "CandyCore", askingRobux: 816, valueLabel: "", image: "" },
    { name: "Ocean", category: "Godly", rarityScore: 7, demand: 7, stability: "Stable", origin: "Summer Event", stock: 3, seller: "TideStock", askingRobux: 1032, valueLabel: "", image: "" },
    { name: "Blossom", category: "Godly", rarityScore: 8, demand: 8, stability: "Rising", origin: "Spring Event", stock: 2, seller: "PetalVault", askingRobux: 600, valueLabel: "", image: "" },
  ];

  const rarityStyles = {
    Unique: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-400/30",
    Chroma: "bg-cyan-500/15 text-cyan-300 border-cyan-400/30",
    Ancient: "bg-red-500/15 text-red-300 border-red-400/30",
    Godly: "bg-amber-500/15 text-amber-300 border-amber-400/30",
    Vintage: "bg-violet-500/15 text-violet-300 border-violet-400/30",
  };

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All Categories");
  const [sortBy, setSortBy] = useState("Sort by Rarity Score");
  const [selectedItem, setSelectedItem] = useState(items[0]);
  const [showPublish, setShowPublish] = useState(false);
  const [publishStep, setPublishStep] = useState(1);
  const [confirmTimer, setConfirmTimer] = useState(20);
  const [timerActive, setTimerActive] = useState(false);
  const [showTOS, setShowTOS] = useState(false);
  const [showMiddlemanModal, setShowMiddlemanModal] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatItem, setChatItem] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [user, setUser] = useState(null);
  const [communityListings, setCommunityListings] = useState([]);
  const messagesEndRef = useRef(null);
  const timerRef = useRef(null);

  // Robux price input state (raw number string)
  const [robuxInput, setRobuxInput] = useState("");
  const [gamepassError, setGamepassError] = useState("");

  const [publishForm, setPublishForm] = useState({
    itemName: ALL_MM2_ITEMS[0],
    quantity: 1,
    askingRobux: "",        // stored as integer string e.g. "10000"
    notes: "",
    imageUrl: "",
    agreeToMiddleman: false,
    sellerRobloxName: "",
    gamepassUrl: "",        // NEW: Roblox gamepass link
  });

  const [middlemanRequest, setMiddlemanRequest] = useState({
    buyerName: "",
    sellerName: "",
    itemName: "",
    agreeToTOS: false,
  });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "listings"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snapshot) => {
      setCommunityListings(snapshot.docs.map((snap) => ({ id: snap.id, ...snap.data() })));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!chatItem) return;
    const chatId = `${chatItem.name}-${chatItem.seller}`.replace(/\s+/g, "-").toLowerCase();
    const q = query(
      collection(db, "chats"),
      where("chatId", "==", chatId),
      orderBy("createdAt", "asc")
    );
    const unsub = onSnapshot(q, (snapshot) => {
      setChatMessages(snapshot.docs.map((snap) => ({ id: snap.id, ...snap.data() })));
    });
    return () => unsub();
  }, [chatItem]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    if (timerActive && confirmTimer > 0) {
      timerRef.current = setTimeout(() => setConfirmTimer((t) => t - 1), 1000);
    }
    return () => clearTimeout(timerRef.current);
  }, [timerActive, confirmTimer]);

  function startTimer() {
    setConfirmTimer(20);
    setTimerActive(true);
  }

  const displayItems = [...communityListings, ...items];

  const filteredItems = useMemo(() => {
    let list = [...displayItems];
    const q = search.trim().toLowerCase();

    if (q) {
      list = list.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.seller.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q) ||
          item.origin.toLowerCase().includes(q)
      );
    }

    if (categoryFilter !== "All Categories") {
      list = list.filter((item) => item.category === categoryFilter);
    }

    if (sortBy === "Lowest Stock") {
      list.sort((a, b) => a.stock - b.stock);
    } else if (sortBy === "Highest Demand") {
      list.sort((a, b) => b.demand - a.demand);
    } else {
      list.sort((a, b) => b.rarityScore - a.rarityScore);
    }

    return list;
  }, [search, categoryFilter, sortBy, displayItems]);

  async function handleGoogleLogin() {
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error(error);
      alert("Google sign-in failed.");
    }
  }

  async function handleLogout() {
    try {
      await signOut(auth);
    } catch (error) {
      console.error(error);
    }
  }

  async function handlePublish() {
    if (!user) {
      alert("Sign in with Google first.");
      return;
    }
    if (!publishForm.sellerRobloxName.trim()) {
      alert("Please enter your Roblox username.");
      return;
    }
    if (confirmTimer > 0) {
      alert("Please wait for the timer to complete.");
      return;
    }

    const robuxAmount = parseInt(publishForm.askingRobux, 10) || 0;

    const newListing = {
      name: publishForm.itemName,
      category: "Godly",
      rarityScore: 7,
      demand: 7,
      stability: "User Listed",
      origin: "Community Listing",
      stock: Math.max(1, Number(publishForm.quantity) || 1),
      seller: user.displayName || user.email || "Google User",
      sellerId: user.uid,
      sellerRobloxName: publishForm.sellerRobloxName,
      valueLabel: robuxAmount > 0 ? `${formatRobux(robuxAmount)} R$` : "See Notes",
      askingRobux: robuxAmount,
      gamepassUrl: publishForm.gamepassUrl,
      notes: publishForm.notes || "",
      image: publishForm.imageUrl || "",
      createdAt: serverTimestamp(),
    };

    try {
      await addDoc(collection(db, "listings"), newListing);
      setShowPublish(false);
      setPublishStep(1);
      setTimerActive(false);
      setConfirmTimer(20);
      setRobuxInput("");
      setGamepassError("");
      setPublishForm({
        itemName: ALL_MM2_ITEMS[0],
        quantity: 1,
        askingRobux: "",
        notes: "",
        imageUrl: "",
        agreeToMiddleman: false,
        sellerRobloxName: "",
        gamepassUrl: "",
      });
    } catch (err) {
      console.error(err);
      alert("Failed to publish. Check your Firestore rules.");
    }
  }

  async function handleDeleteListing(listingId) {
    if (!user) return;
    if (!confirm("Delete this listing?")) return;

    try {
      await deleteDoc(doc(db, "listings", listingId));
    } catch (err) {
      console.error(err);
      alert("Failed to delete. Check Firestore rules.");
    }
  }

  function handleMiddlemanRequest() {
    if (!user) {
      alert("Sign in with Google first.");
      return;
    }
    if (!middlemanRequest.agreeToTOS) {
      alert("You must agree to the Terms of Service.");
      return;
    }
    if (!middlemanRequest.buyerName || !middlemanRequest.sellerName || !middlemanRequest.itemName) {
      alert("Please fill in all fields.");
      return;
    }

    alert("Request sent! Now contact the middleman on Roblox to proceed.");
    setShowMiddlemanModal(false);
    setMiddlemanRequest({
      buyerName: "",
      sellerName: "",
      itemName: "",
      agreeToTOS: false,
    });
  }

  function openChat(item) {
    if (!user) {
      alert("Sign in with Google first to message sellers.");
      return;
    }
    setChatItem(item);
    setChatMessages([]);
    setShowChat(true);
  }

  async function sendMessage() {
    if (!newMessage.trim() || !chatItem || !user) return;

    const chatId = `${chatItem.name}-${chatItem.seller}`.replace(/\s+/g, "-").toLowerCase();

    try {
      await addDoc(collection(db, "chats"), {
        chatId,
        text: newMessage.trim(),
        senderName: user.displayName || user.email || "Anonymous",
        senderId: user.uid,
        itemName: chatItem.name,
        sellerName: chatItem.seller,
        createdAt: serverTimestamp(),
      });
      setNewMessage("");
    } catch (err) {
      console.error(err);
      alert("Failed to send message. Check Firestore rules.");
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function closePublish() {
    setShowPublish(false);
    setPublishStep(1);
    setTimerActive(false);
    setConfirmTimer(20);
    setRobuxInput("");
    setGamepassError("");
  }

  // Handle raw Robux input — strip non-digits, no decimals
  function handleRobuxInput(raw) {
    const digits = raw.replace(/[^0-9]/g, "");
    setRobuxInput(digits);
    setPublishForm((p) => ({ ...p, askingRobux: digits }));
  }

  // Step dots/bar indicator for 4 steps
  const stepColors = [
    publishStep >= 1 ? "bg-violet-500" : "bg-white/15",
    publishStep >= 2 ? "bg-violet-500" : "bg-white/15",
    publishStep >= 3 ? "bg-violet-500" : "bg-white/15",
    publishStep >= 4 ? "bg-green-500" : "bg-white/15",
  ];

  const stepLabels = ["Item Info", "Gamepass", "Middleman", "Confirm"];

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(168,85,247,0.18),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.12),transparent_25%)]" />
      <div className="relative mx-auto max-w-7xl px-6 py-8">
        <header className="mb-8 flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="mb-2 text-sm uppercase tracking-[0.25em] text-violet-300">Community Catalog</p>
              <h1 className="text-4xl font-black tracking-tight md:text-5xl">MM2 Market Hub</h1>
              <p className="mt-3 max-w-2xl text-sm text-white/70 md:text-base">
                Browse community listings, compare rarity, demand, and origin. Secure trades with our verified middleman.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm md:w-[320px]">
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <div className="text-white/50">Listings</div>
                <div className="mt-1 text-2xl font-bold">{displayItems.length}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <div className="text-white/50">Sellers</div>
                <div className="mt-1 text-2xl font-bold">{new Set(displayItems.map((i) => i.seller)).size}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <div className="text-white/50">Middleman</div>
                <div className="mt-1 text-2xl font-bold text-green-400">Verified ✓</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <div className="text-white/50">Updated</div>
                <div className="mt-1 text-2xl font-bold">Live</div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm">
            <div className="text-white/75">
              Signed in as <span className="font-semibold text-white">{user?.displayName || user?.email || "Guest"}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {user ? (
                <button onClick={handleLogout} className="rounded-2xl border border-white/10 px-4 py-2 text-white/85 hover:bg-white/5">
                  Sign Out
                </button>
              ) : (
                <button onClick={handleGoogleLogin} className="rounded-2xl border border-white/10 px-4 py-2 text-white/85 hover:bg-white/5">
                  Continue with Google
                </button>
              )}
              <button onClick={() => setShowMiddlemanModal(true)} className="rounded-2xl bg-green-600 px-4 py-2 font-semibold text-white shadow-lg hover:scale-[1.02]">
                Request Middleman
              </button>
              <button onClick={() => { setShowPublish(true); setPublishStep(1); }} className="rounded-2xl bg-violet-500 px-4 py-2 font-semibold text-white shadow-lg hover:scale-[1.02]">
                Publish Listing
              </button>
              <button onClick={() => setShowTOS(true)} className="rounded-2xl border border-white/10 px-4 py-2 text-xs text-white/85 hover:bg-white/5">
                Terms & Rules
              </button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[1.4fr_0.7fr_0.7fr_0.8fr]">
            <input
              className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none placeholder:text-white/35"
              placeholder="Search items, sellers, category, origin..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/80 outline-none" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option>All Categories</option>
              <option>Unique</option>
              <option>Chroma</option>
              <option>Ancient</option>
              <option>Godly</option>
              <option>Vintage</option>
            </select>
            <select className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/80 outline-none" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option>Sort by Rarity Score</option>
              <option>Lowest Stock</option>
              <option>Highest Demand</option>
            </select>
            <button onClick={() => { setShowPublish(true); setPublishStep(1); }} className="rounded-2xl bg-violet-500 px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:scale-[1.02]">
              Publish an Item
            </button>
          </div>
        </header>

        <section className="mb-8 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <h2 className="text-2xl font-bold mb-1">Featured Listings</h2>
            <p className="text-sm text-white/60 mb-4">Rarity score, demand, stability, and origin for every item.</p>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredItems.slice(0, 9).map((item) => (
                <div key={`${item.name}-${item.seller}-${item.origin}`} className="rounded-3xl border border-white/10 bg-black/25 p-4 shadow-xl transition hover:-translate-y-1 hover:bg-black/35">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-bold leading-tight">{item.name}</h3>
                      <p className="text-sm text-white/50">Seller: {item.seller}</p>
                      {item.origin === "Community Listing" && (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-violet-400">Community</span>
                          {item.sellerId === user?.uid && (
                            <button
                              onClick={() => handleDeleteListing(item.id)}
                              className="rounded-full bg-red-500/20 border border-red-400/30 px-2 py-0.5 text-xs text-red-300 hover:bg-red-500/40"
                            >
                              ✕ Delete
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${rarityStyles[item.category] || "bg-white/10 text-white border-white/20"}`}>
                      {item.category}
                    </span>
                  </div>

                  <div className="mb-4 flex h-28 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-white/10 bg-gradient-to-br from-white/5 to-transparent text-center text-sm text-white/35">
                    {(item.image || getLocalWeaponImage(item.name)) ? (
                      <img
                        src={item.image || getLocalWeaponImage(item.name)}
                        alt={item.name}
                        className="h-full w-full object-contain p-2"
                      />
                    ) : (
                      "Add item image here"
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-xl bg-white/5 p-2">
                      <div className="text-white/45">Price</div>
                      <div className="font-semibold text-white">
                        {item.askingRobux ? `${formatRobux(item.askingRobux)} R$` : item.valueLabel}
                      </div>
                    </div>
                    <div className="rounded-xl bg-white/5 p-2"><div className="text-white/45">Origin</div><div className="font-semibold text-white">{item.origin}</div></div>
                    <div className="rounded-xl bg-white/5 p-2"><div className="text-white/45">Rarity</div><div className="font-semibold text-white">{item.rarityScore}/10</div></div>
                    <div className="rounded-xl bg-white/5 p-2"><div className="text-white/45">Demand</div><div className="font-semibold text-white">{item.demand}/10</div></div>
                    <div className="rounded-xl bg-white/5 p-2"><div className="text-white/45">Stability</div><div className="font-semibold text-white">{item.stability}</div></div>
                    <div className="rounded-xl bg-white/5 p-2"><div className="text-white/45">Stock</div><div className="font-bold text-white">{item.stock} listed</div></div>
                  </div>

                  {item.notes ? (
                    <div className="mt-2 rounded-xl bg-white/5 p-2 text-xs text-white/60">
                      {item.notes}
                    </div>
                  ) : null}

                  <div className="mt-4 flex gap-2">
                    <button onClick={() => openChat(item)} className="flex-1 rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:opacity-90">
                      Message Seller
                    </button>
                    <button onClick={() => { setSelectedItem(item); setShowMiddlemanModal(true); }} className="rounded-2xl border border-green-400/50 px-4 py-2.5 text-sm text-green-300 hover:bg-green-400/10">
                      Safe Trade
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
              <h2 className="text-2xl font-bold">Selected Item</h2>
              <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xl font-bold">{selectedItem.name}</div>
                    <div className="text-sm text-white/50">Seller: {selectedItem.seller}</div>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${rarityStyles[selectedItem.category] || "bg-white/10 text-white border-white/20"}`}>
                    {selectedItem.category}
                  </span>
                </div>

                <div className="mb-4 flex h-32 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-white/10 bg-gradient-to-br from-white/5 to-transparent text-sm text-white/35">
                  {(selectedItem.image || getLocalWeaponImage(selectedItem.name)) ? (
                    <img
                      src={selectedItem.image || getLocalWeaponImage(selectedItem.name)}
                      alt={selectedItem.name}
                      className="h-full w-full object-contain p-2"
                    />
                  ) : (
                    `Add ${selectedItem.name} image here`
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-white/5 p-3">
                    <div className="text-white/45">Price</div>
                    <div className="font-semibold text-white">
                      {selectedItem.askingRobux ? `${formatRobux(selectedItem.askingRobux)} R$` : selectedItem.valueLabel}
                    </div>
                  </div>
                  <div className="rounded-xl bg-white/5 p-3"><div className="text-white/45">Origin</div><div className="font-semibold text-white">{selectedItem.origin}</div></div>
                  <div className="rounded-xl bg-white/5 p-3"><div className="text-white/45">Rarity Score</div><div className="font-semibold text-white">{selectedItem.rarityScore}/10</div></div>
                  <div className="rounded-xl bg-white/5 p-3"><div className="text-white/45">Demand</div><div className="font-semibold text-white">{selectedItem.demand}/10</div></div>
                  <div className="rounded-xl bg-white/5 p-3"><div className="text-white/45">Stability</div><div className="font-semibold text-white">{selectedItem.stability}</div></div>
                  <div className="rounded-xl bg-white/5 p-3"><div className="text-white/45">Stock</div><div className="font-semibold text-white">{selectedItem.stock} listed</div></div>
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => window.open(VERIFIED_MIDDLEMAN.robloxProfile, "_blank")}
                    className="flex-1 rounded-2xl border border-white/10 px-4 py-2.5 text-sm text-white/80 hover:bg-white/5"
                  >
                    Withdrawal Assets
                  </button>
                </div>

                <button onClick={() => openChat(selectedItem)} className="mt-4 w-full rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-black hover:opacity-90">
                  Message Seller
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
              <h2 className="text-2xl font-bold mb-4">Verified Middleman</h2>
              <div className="rounded-2xl border border-green-400/30 bg-green-500/10 p-4 mb-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-green-400/40 bg-green-500/20 text-green-300 text-lg font-bold">✓</div>
                  <div>
                    <div className="font-semibold text-white">{VERIFIED_MIDDLEMAN.robloxName}</div>
                    <div className="text-xs text-white/55">ID: {VERIFIED_MIDDLEMAN.robloxId}</div>
                    <div className="text-xs text-white/55">{VERIFIED_MIDDLEMAN.completedTrades}+ trades · Trust: {VERIFIED_MIDDLEMAN.trustScore}/100</div>
                  </div>
                </div>
              </div>
              <a
                href={VERIFIED_MIDDLEMAN.robloxProfile}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full rounded-2xl border border-green-400/40 bg-green-500/10 p-3 text-center text-sm font-semibold text-green-300 hover:bg-green-500/15"
              >
                View Roblox Profile →
              </a>
              <button onClick={() => setShowMiddlemanModal(true)} className="mt-3 w-full rounded-2xl bg-green-600 py-3 text-sm font-semibold text-white hover:bg-green-700">
                Request This Middleman
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <h2 className="text-2xl font-bold mb-1">Full Inventory Preview</h2>
          <p className="text-sm text-white/60 mb-4">Showing {filteredItems.length} items</p>
          <div className="overflow-hidden rounded-2xl border border-white/10">
            <div className="grid grid-cols-7 bg-white/5 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-white/50">
              <div>Item</div>
              <div>Category</div>
              <div>Origin</div>
              <div>Rarity</div>
              <div>Demand</div>
              <div>Stock</div>
              <div>Status</div>
            </div>
            {filteredItems.map((item) => (
              <div key={`${item.name}-${item.seller}-${item.origin}-row`} className="grid grid-cols-7 border-t border-white/10 px-4 py-4 text-sm text-white/80">
                <div className="font-medium text-white">{item.name}</div>
                <div>{item.category}</div>
                <div>{item.origin}</div>
                <div>{item.rarityScore}/10</div>
                <div>{item.demand}/10</div>
                <div>{item.stock}</div>
                <div className={item.stock <= 2 ? "text-red-300" : "text-emerald-300"}>
                  {item.stock <= 2 ? "Low Stock" : "Available"}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── CHAT MODAL ── */}
        {showChat && chatItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-neutral-950 shadow-2xl flex flex-col" style={{ height: "560px" }}>
              <div className="flex items-center justify-between border-b border-white/10 p-4">
                <div>
                  <div className="font-bold text-white">{chatItem.name}</div>
                  <div className="text-xs text-white/50">Seller: {chatItem.seller}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${rarityStyles[chatItem.category] || "bg-white/10 text-white border-white/20"}`}>
                    {chatItem.category}
                  </span>
                  <button onClick={() => setShowChat(false)} className="rounded-xl border border-white/10 px-3 py-1 text-sm text-white/75 hover:bg-white/5">
                    ✕
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {chatMessages.length === 0 && (
                  <div className="flex h-full items-center justify-center text-sm text-white/30 text-center">
                    No messages yet. Start the conversation about {chatItem.name}!
                  </div>
                )}

                {chatMessages.map((msg) => {
                  const isMe = msg.senderId === user?.uid;
                  return (
                    <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${isMe ? "bg-violet-500 text-white rounded-br-sm" : "bg-white/10 text-white/90 rounded-bl-sm"}`}>
                        {!isMe && <div className="text-xs text-white/45 mb-1">{msg.senderName}</div>}
                        <div>{msg.text}</div>
                        <div className={`text-xs mt-1 ${isMe ? "text-violet-200/60" : "text-white/30"}`}>
                          {msg.createdAt?.toDate?.()?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) || "..."}
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div ref={messagesEndRef} />
              </div>

              <div className="border-t border-white/10 p-4">
                {!user ? (
                  <button onClick={handleGoogleLogin} className="w-full rounded-2xl bg-white py-3 text-sm font-semibold text-black">
                    Sign in to send messages
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <input
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={handleKeyDown}
                      className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none placeholder:text-white/30"
                      placeholder={`Message about ${chatItem.name}...`}
                    />
                    <button onClick={sendMessage} disabled={!newMessage.trim()} className="rounded-2xl bg-violet-500 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40 hover:bg-violet-600">
                      Send
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── PUBLISH MODAL (4 STEPS) ── */}
        {showPublish && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-neutral-950 p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
              {/* Header + step indicator */}
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Publish Listing</h2>
                  <div className="flex items-center gap-1.5 mt-3">
                    {stepColors.map((color, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <div className={`h-2 w-8 rounded-full transition-all duration-300 ${color}`} />
                        {i < stepColors.length - 1 && <div className="h-px w-2 bg-white/10" />}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    {stepLabels.map((label, i) => (
                      <span
                        key={i}
                        className={`text-xs transition-all ${publishStep === i + 1 ? "text-white font-semibold" : "text-white/30"}`}
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
                <button onClick={closePublish} className="rounded-xl border border-white/10 px-3 py-1 text-sm text-white/75">
                  Close
                </button>
              </div>

              {/* Not signed in */}
              {!user ? (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-50/85">
                    Sign in with Google first to publish a listing.
                  </div>
                  <button onClick={handleGoogleLogin} className="rounded-2xl bg-white px-4 py-3 font-semibold text-black w-full">
                    Continue with Google
                  </button>
                </div>

              /* ── STEP 1: Item Info ── */
              ) : publishStep === 1 ? (
                <div>
                  <p className="text-sm text-white/50 mb-4">Step 1 of 4 — What are you selling?</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <label className="block text-xs text-white/50 mb-1">Item Name</label>
                      <select
                        value={publishForm.itemName}
                        onChange={(e) => setPublishForm((p) => ({ ...p, itemName: e.target.value }))}
                        className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/80"
                      >
                        {ALL_MM2_ITEMS.map((item) => <option key={item}>{item}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-white/50 mb-1">Quantity</label>
                      <input
                        value={publishForm.quantity}
                        onChange={(e) => setPublishForm((p) => ({ ...p, quantity: e.target.value }))}
                        className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm"
                        placeholder="1"
                        type="number"
                        min="1"
                      />
                    </div>

                    {/* Price in Robux */}
                    <div>
                      <label className="block text-xs text-white/50 mb-1">
                        Price (Robux) <span className="text-white/30">— no decimals</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-amber-400">R$</span>
                        <input
                          value={robuxInput}
                          onChange={(e) => handleRobuxInput(e.target.value)}
                          className="w-full rounded-2xl border border-white/10 bg-black/30 pl-9 pr-4 py-3 text-sm"
                          placeholder="e.g. 10000"
                          type="text"
                          inputMode="numeric"
                        />
                      </div>
                      {robuxInput && (
                        <p className="text-xs text-white/40 mt-1">
                          ≈ ${(parseInt(robuxInput, 10) / USD_TO_ROBUX).toFixed(2)} USD
                          <span className="ml-2 text-white/25">(based on luger.gg / bloxcart.com rates × 3)</span>
                        </p>
                      )}
                    </div>

                    {/* Robux preset buttons */}
                    <div className="md:col-span-2">
                      <label className="block text-xs text-white/50 mb-2">Quick price presets</label>
                      <div className="flex flex-wrap gap-2">
                        {ROBUX_PRESETS.map((preset) => (
                          <button
                            key={preset.value}
                            onClick={() => { setRobuxInput(String(preset.value)); setPublishForm((p) => ({ ...p, askingRobux: String(preset.value) })); }}
                            className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all ${
                              parseInt(robuxInput, 10) === preset.value
                                ? "border-amber-400/60 bg-amber-500/20 text-amber-300"
                                : "border-white/10 bg-black/30 text-white/60 hover:border-white/25 hover:text-white/80"
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs text-white/50 mb-1">Image URL (optional)</label>
                      <input
                        value={publishForm.imageUrl}
                        onChange={(e) => setPublishForm((p) => ({ ...p, imageUrl: e.target.value }))}
                        className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm"
                        placeholder="Paste image URL here"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs text-white/50 mb-1">Description / Trade Notes (optional)</label>
                      <textarea
                        value={publishForm.notes}
                        onChange={(e) => setPublishForm((p) => ({ ...p, notes: e.target.value }))}
                        className="w-full min-h-24 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm"
                        placeholder="Any extra details, what you want in return, contact info..."
                      />
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button onClick={() => setPublishStep(2)} className="flex-1 rounded-2xl bg-violet-500 px-4 py-3 font-semibold text-white">
                      Next: Verify Gamepass →
                    </button>
                    <button onClick={closePublish} className="rounded-2xl border border-white/10 px-4 py-3 text-white/80">
                      Cancel
                    </button>
                  </div>
                </div>

              /* ── STEP 2 (NEW): Gamepass Verification ── */
              ) : publishStep === 2 ? (
                <div>
                  <p className="text-sm text-white/50 mb-4">Step 2 of 4 — Verify your Roblox gamepass</p>

                  <div className="rounded-2xl border border-violet-400/20 bg-violet-500/10 p-4 mb-5 text-sm text-violet-100/80">
                    <div className="font-semibold text-white mb-1">Why do we need this?</div>
                    To keep the marketplace safe and scam-free, all sellers must link a valid Roblox gamepass. This verifies you're a real Roblox user and helps buyers trust your listing.
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/25 p-4 mb-4">
                    <label className="block text-xs text-white/50 mb-2">Roblox Gamepass URL</label>
                    <input
                      value={publishForm.gamepassUrl}
                      onChange={(e) => {
                        setPublishForm((p) => ({ ...p, gamepassUrl: e.target.value }));
                        setGamepassError("");
                      }}
                      className={`w-full rounded-2xl border px-4 py-3 text-sm bg-black/30 outline-none transition-all ${
                        gamepassError
                          ? "border-red-400/60"
                          : publishForm.gamepassUrl && validateGamepassUrl(publishForm.gamepassUrl)
                          ? "border-green-400/60"
                          : "border-white/10"
                      }`}
                      placeholder="https://www.roblox.com/game-pass/248568521/unnamed"
                    />
                    {gamepassError && (
                      <p className="text-xs text-red-400 mt-2">{gamepassError}</p>
                    )}
                    {!gamepassError && publishForm.gamepassUrl && validateGamepassUrl(publishForm.gamepassUrl) && (
                      <p className="text-xs text-green-400 mt-2">✓ Valid gamepass URL</p>
                    )}
                    <p className="text-xs text-white/35 mt-2">
                      Format: <span className="text-white/50">https://www.roblox.com/game-pass/[ID]/[name]</span>
                    </p>
                  </div>

                  {/* How to find your gamepass */}
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4 mb-5 text-sm space-y-2">
                    <div className="font-semibold text-white mb-2">How to find your gamepass link</div>
                    <div className="flex items-start gap-2 text-white/65">
                      <span className="text-violet-400 font-bold mt-0.5">1.</span>
                      <span>Go to <span className="text-white">roblox.com</span> and open any game you own a gamepass for</span>
                    </div>
                    <div className="flex items-start gap-2 text-white/65">
                      <span className="text-violet-400 font-bold mt-0.5">2.</span>
                      <span>Click the <span className="text-white">Store</span> tab and find one of your gamepasses</span>
                    </div>
                    <div className="flex items-start gap-2 text-white/65">
                      <span className="text-violet-400 font-bold mt-0.5">3.</span>
                      <span>Copy the URL from your browser — it should look like the example above</span>
                    </div>
                    <a
                      href="https://www.roblox.com/develop?View=3"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block mt-1 text-xs text-blue-400 hover:text-blue-300 underline"
                    >
                      Open Roblox Developer Portal to find your gamepasses →
                    </a>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => setPublishStep(1)} className="rounded-2xl border border-white/10 px-4 py-3 text-white/80">
                      ← Back
                    </button>
                    <button
                      onClick={() => {
                        if (!publishForm.gamepassUrl.trim()) {
                          setGamepassError("Please enter your Roblox gamepass URL to continue.");
                          return;
                        }
                        if (!validateGamepassUrl(publishForm.gamepassUrl)) {
                          setGamepassError("That doesn't look like a valid Roblox gamepass URL. Please check the format and try again.");
                          return;
                        }
                        setGamepassError("");
                        setPublishStep(3);
                      }}
                      className="flex-1 rounded-2xl bg-violet-500 px-4 py-3 font-semibold text-white hover:bg-violet-600"
                    >
                      Gamepass Verified → Next
                    </button>
                  </div>
                </div>

              /* ── STEP 3 (was 2): Middleman Agreement ── */
              ) : publishStep === 3 ? (
                <div>
                  <p className="text-sm text-white/50 mb-4">Step 3 of 4 — Do you trust this middleman?</p>

                  <div className="rounded-2xl border border-green-400/30 bg-green-500/10 p-5 mb-4">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-green-400/50 bg-green-500/20 text-green-300 text-2xl font-bold">✓</div>
                      <div>
                        <div className="text-lg font-bold text-white">{VERIFIED_MIDDLEMAN.robloxName}</div>
                        <div className="text-xs text-white/55">Roblox ID: {VERIFIED_MIDDLEMAN.robloxId}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                      <div className="rounded-xl bg-black/30 p-3 text-center">
                        <div className="text-2xl font-bold text-green-400">500+</div>
                        <div className="text-xs text-white/50 mt-0.5">Transactions</div>
                      </div>
                      <div className="rounded-xl bg-black/30 p-3 text-center">
                        <div className="text-2xl font-bold text-green-400">100%</div>
                        <div className="text-xs text-white/50 mt-0.5">Positive Rating</div>
                      </div>
                    </div>

                    <div className="space-y-2 text-sm text-white/70 mb-4">
                      <div className="flex items-start gap-2"><span className="text-green-400">✓</span><span>Trusted by the entire MM2 Market Hub community</span></div>
                      <div className="flex items-start gap-2"><span className="text-green-400">✓</span><span>Holds items safely until both parties confirm the trade</span></div>
                      <div className="flex items-start gap-2"><span className="text-green-400">✓</span><span>Never scammed anyone — 100% verified clean record</span></div>
                      <div className="flex items-start gap-2"><span className="text-green-400">✓</span><span>Available on Roblox to facilitate your trade in real time</span></div>
                    </div>

                    <a
                      href={VERIFIED_MIDDLEMAN.robloxProfile}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full rounded-2xl border border-green-400/40 bg-black/30 p-3 text-center text-sm font-semibold text-green-300 hover:bg-green-500/10"
                    >
                      View Middleman Roblox Profile →
                    </a>
                  </div>

                  <div className="flex items-start gap-3 mb-4 p-4 rounded-2xl border border-white/10 bg-black/25">
                    <input
                      type="checkbox"
                      checked={publishForm.agreeToMiddleman || false}
                      onChange={(e) => setPublishForm((p) => ({ ...p, agreeToMiddleman: e.target.checked }))}
                      className="mt-1"
                      id="trustCheck"
                    />
                    <label htmlFor="trustCheck" className="text-sm text-white/75 cursor-pointer">
                      Yes, I trust this middleman and agree to use them for all trades from this listing. I have read the{" "}
                      <button onClick={() => setShowTOS(true)} className="text-blue-400 hover:text-blue-300 underline">
                        Terms of Service
                      </button>.
                    </label>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => setPublishStep(2)} className="rounded-2xl border border-white/10 px-4 py-3 text-white/80">
                      ← Back
                    </button>
                    <button
                      onClick={() => {
                        if (!publishForm.agreeToMiddleman) {
                          alert("You must confirm you trust the middleman to continue.");
                          return;
                        }
                        setPublishStep(4);
                      }}
                      className="flex-1 rounded-2xl bg-violet-500 px-4 py-3 font-semibold text-white hover:bg-violet-600"
                    >
                      Yes, I Trust This Middleman →
                    </button>
                  </div>
                </div>

              /* ── STEP 4 (was 3): Add Middleman + Confirm ── */
              ) : (
                <div>
                  <p className="text-sm text-white/50 mb-4">Step 4 of 4 — Add the middleman on Roblox so they know to expect you.</p>

                  <div className="rounded-2xl border border-white/10 bg-black/25 p-4 mb-4">
                    <label className="block text-xs text-white/50 mb-2">Your Roblox Username</label>
                    <input
                      value={publishForm.sellerRobloxName}
                      onChange={(e) => setPublishForm((p) => ({ ...p, sellerRobloxName: e.target.value }))}
                      className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm"
                      placeholder="Enter your Roblox username"
                    />
                    <p className="text-xs text-white/40 mt-2">This lets the middleman know who to accept the trade from.</p>
                  </div>

                  <div className="rounded-2xl border border-green-400/30 bg-green-500/10 p-4 mb-4">
                    <div className="font-semibold text-white mb-2">Add the middleman on Roblox</div>
                    <p className="text-sm text-white/65 mb-3">
                      Click the button below to visit the middleman's Roblox profile and send them a friend request. It takes <strong className="text-white">5–20 seconds</strong> for the middleman to confirm you.
                    </p>

                    <a
                      href={VERIFIED_MIDDLEMAN.robloxProfile}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => { if (!timerActive) startTimer(); }}
                      className="block w-full rounded-2xl bg-green-600 p-3 text-center text-sm font-semibold text-white hover:bg-green-700 mb-2"
                    >
                      Open Middleman Roblox Profile - Add Friend →
                    </a>

                    <p className="text-xs text-white/40 text-center">Clicking the button above will start the confirmation timer.</p>
                  </div>

                  {timerActive && (
                    <div className="rounded-2xl border border-white/10 bg-black/25 p-4 mb-4 text-center">
                      {confirmTimer > 0 ? (
                        <div>
                          <div className="text-4xl font-bold text-violet-400 mb-1">{confirmTimer}s</div>
                          <div className="text-sm text-white/50">Waiting for middleman confirmation...</div>
                          <div className="mt-3 h-2 w-full rounded-full bg-white/10 overflow-hidden">
                            <div
                              className="h-2 rounded-full bg-violet-500 transition-all"
                              style={{ width: `${((20 - confirmTimer) / 20) * 100}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="text-2xl font-bold text-green-400 mb-1">✓ Confirmed!</div>
                          <div className="text-sm text-white/50">Middleman has confirmed. You can now publish your listing.</div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button onClick={() => setPublishStep(3)} className="rounded-2xl border border-white/10 px-4 py-3 text-white/80">
                      ← Back
                    </button>
                    <button
                      onClick={() => {
                        if (!publishForm.sellerRobloxName.trim()) {
                          alert("Please enter your Roblox username.");
                          return;
                        }
                        if (!timerActive) {
                          alert("Please click the button to open the middleman's profile and add them first.");
                          return;
                        }
                        if (confirmTimer > 0) {
                          alert(`Please wait ${confirmTimer} more seconds for the middleman to confirm.`);
                          return;
                        }
                        handlePublish();
                      }}
                      disabled={confirmTimer > 0 || !timerActive}
                      className="flex-1 rounded-2xl bg-green-600 px-4 py-3 font-semibold text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {confirmTimer > 0 || !timerActive ? "Waiting for Confirmation..." : "✓ Confirm & Publish Listing"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── MIDDLEMAN MODAL ── */}
        {showMiddlemanModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-neutral-950 p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-2xl font-bold">Request Middleman Escrow</h2>
                <button onClick={() => setShowMiddlemanModal(false)} className="rounded-xl border border-white/10 px-3 py-1 text-sm text-white/75">
                  Close
                </button>
              </div>

              <div className="rounded-2xl border border-green-400/30 bg-green-500/10 p-4 mb-4 text-sm text-green-200">
                <strong>Secure your trade!</strong> Our verified middleman holds items from both parties until both confirm the exchange is complete.
              </div>

              {!user ? (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-50/85">
                    Sign in with Google first.
                  </div>
                  <button onClick={handleGoogleLogin} className="rounded-2xl bg-white px-4 py-3 font-semibold text-black w-full">
                    Continue with Google
                  </button>
                </div>
              ) : (
                <div>
                  <div className="grid gap-3 md:grid-cols-2 mb-3">
                    <div>
                      <label className="block text-xs text-white/60 mb-2">Your Roblox Username</label>
                      <input
                        value={middlemanRequest.buyerName}
                        onChange={(e) => setMiddlemanRequest((p) => ({ ...p, buyerName: e.target.value }))}
                        className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm"
                        placeholder="Your Roblox name"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-white/60 mb-2">Seller's Roblox Username</label>
                      <input
                        value={middlemanRequest.sellerName}
                        onChange={(e) => setMiddlemanRequest((p) => ({ ...p, sellerName: e.target.value }))}
                        className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm"
                        placeholder="Seller's Roblox name"
                      />
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="block text-xs text-white/60 mb-2">Item Being Traded</label>
                    <input
                      value={middlemanRequest.itemName}
                      onChange={(e) => setMiddlemanRequest((p) => ({ ...p, itemName: e.target.value }))}
                      className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm"
                      placeholder="e.g. Harvester + 5 Seers for Corrupt"
                    />
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/25 p-4 mb-4 text-sm space-y-1">
                    <div className="font-semibold text-white mb-2">Middleman Details</div>
                    <div className="text-white/70"><span className="text-white/45">Name:</span> {VERIFIED_MIDDLEMAN.robloxName}</div>
                    <div className="text-white/70"><span className="text-white/45">Roblox ID:</span> {VERIFIED_MIDDLEMAN.robloxId}</div>
                    <div className="text-white/70"><span className="text-white/45">Trades Done:</span> {VERIFIED_MIDDLEMAN.completedTrades}+</div>
                    <div className="text-white/70"><span className="text-white/45">Trust Score:</span> {VERIFIED_MIDDLEMAN.trustScore}/100</div>
                    <a href={VERIFIED_MIDDLEMAN.robloxProfile} target="_blank" rel="noopener noreferrer" className="inline-block pt-1 text-blue-400 hover:text-blue-300 underline text-xs">
                      View on Roblox →
                    </a>
                  </div>

                  <div className="flex items-start gap-3 mb-4 p-4 rounded-2xl border border-white/10 bg-black/25">
                    <input
                      type="checkbox"
                      checked={middlemanRequest.agreeToTOS}
                      onChange={(e) => setMiddlemanRequest((p) => ({ ...p, agreeToTOS: e.target.checked }))}
                      className="mt-1"
                    />
                    <label className="text-sm text-white/75">
                      I agree to the{" "}
                      <button onClick={() => setShowTOS(true)} className="text-blue-400 hover:text-blue-300 underline">
                        Terms of Service
                      </button>
                      {" "}and understand both parties must confirm before items are released.
                    </label>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={handleMiddlemanRequest} className="flex-1 rounded-2xl bg-green-600 px-4 py-3 font-semibold text-white hover:bg-green-700">
                      Send Middleman Request
                    </button>
                    <button onClick={() => setShowMiddlemanModal(false)} className="rounded-2xl border border-white/10 px-4 py-3 text-white/80">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TOS MODAL ── */}
        {showTOS && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-neutral-950 p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-2xl font-bold">Terms of Service</h2>
                <button onClick={() => setShowTOS(false)} className="rounded-xl border border-white/10 px-3 py-1 text-sm text-white/75">
                  Close
                </button>
              </div>

              <div className="space-y-5 text-sm">
                <div>
                  <h3 className="font-semibold text-white mb-1">1. Middleman Service Agreement</h3>
                  <p className="text-white/65">By using this service you agree to entrust items to our verified middleman for secure escrow trading. The middleman holds items from both parties until both confirm the exchange is satisfactory.</p>
                </div>
                <div>
                  <h3 className="font-semibold text-white mb-1">2. The Verified Middleman</h3>
                  <p className="text-white/65">Our only verified middleman is Roblox ID <strong className="text-white">{VERIFIED_MIDDLEMAN.robloxId}</strong>. Only trade through this account. Never send items to anyone else claiming to be a middleman — that is a scam.</p>
                </div>
                <div>
                  <h3 className="font-semibold text-white mb-1">3. How the Trade Works</h3>
                  <ol className="list-decimal list-inside space-y-1 text-white/65">
                    <li>Both parties agree on items and request the middleman on this site</li>
                    <li>Contact the middleman on Roblox with the trade details</li>
                    <li>Both parties send their items to the middleman at the same time</li>
                    <li>The middleman confirms receipt of both sides</li>
                    <li>Each party confirms they are happy with the deal</li>
                    <li>The middleman then distributes items to the correct parties</li>
                  </ol>
                </div>
                <div>
                  <h3 className="font-semibold text-white mb-1">4. Platform Rules</h3>
                  <ul className="list-disc list-inside space-y-1 text-white/65">
                    <li>No scamming, fraud, or dishonest trading of any kind</li>
                    <li>All items must be legitimately owned by the trader</li>
                    <li>Do not attempt to bribe or pressure the middleman</li>
                    <li>Disputes must be raised with community moderators</li>
                    <li>The middleman's decision on any dispute is final</li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold text-white mb-1">5. Fees</h3>
                  <p className="text-white/65">The middleman may charge a small fee for high-value trades. This will be agreed upon directly on Roblox before the trade begins.</p>
                </div>
                <div>
                  <h3 className="font-semibold text-white mb-1">6. Liability</h3>
                  <p className="text-white/65">MM2 Market Hub is provided "as is". We are not responsible for lost items, account issues, or disputes from trades done outside this service. You trade at your own risk.</p>
                </div>
                <div>
                  <h3 className="font-semibold text-white mb-1">7. Support</h3>
                  <p className="text-white/65">For disputes, contact the middleman directly on Roblox or reach out to community moderators. Harassment or threats will result in a permanent ban.</p>
                </div>
                <div className="rounded-2xl border border-green-400/30 bg-green-500/10 p-4">
                  <p className="text-green-200 text-xs">By publishing a listing you confirm you have read and agreed to all terms above.</p>
                </div>
              </div>

              <button onClick={() => setShowTOS(false)} className="mt-6 w-full rounded-2xl bg-white px-4 py-3 font-semibold text-black hover:opacity-90">
                I Understand & Agree
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
