"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase"; 
import { collection, getDocs, query, doc, setDoc } from "firebase/firestore";
import { Search, UserPlus, Trophy, Users, X } from "lucide-react";

export default function AdminRosterPage() {
  const [players, setPlayers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Filtering & Search State
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all"); 
  const [filterCategory, setFilterCategory] = useState("all"); 

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState("");
  const [formData, setFormData] = useState({
    id: "",
    name: "",
    mobile: "",
    category: "B", // Default to Noobie
    playsSingles: false,
    playsDoubles: false
  });

  // Fetch players from Firestore
  useEffect(() => {
    const fetchPlayers = async () => {
      try {
        const playersRef = collection(db, "players");
        const q = query(playersRef); 
        const querySnapshot = await getDocs(q);
        
        const fetchedPlayers = [];
        querySnapshot.forEach((doc) => {
          fetchedPlayers.push({
            id: doc.id, 
            ...doc.data()
          });
        });
        
        setPlayers(fetchedPlayers);
      } catch (error) {
        console.error("Error fetching players:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPlayers();
  }, []);

  // Handle Manual Player Add
  const handleManualAdd = async (e) => {
    e.preventDefault();
    setModalError("");

    if (!formData.id.trim() || !formData.name.trim()) {
      setModalError("MHT ID and Name are required.");
      return;
    }

    if (!formData.playsSingles && !formData.playsDoubles) {
      setModalError("Please select at least one tournament (Singles or Doubles).");
      return;
    }

    setIsSubmitting(true);
    try {
      const cleanId = formData.id.trim();
      const playerRef = doc(db, "players", cleanId);
      
      const newPlayerData = {
        name: formData.name.trim(),
        mobile: formData.mobile.trim(),
        category: formData.category,
        playsSingles: formData.playsSingles,
        playsDoubles: formData.playsDoubles,
        updatedAt: new Date().toISOString()
      };

      // Push to Firestore (merge prevents wiping photoUrls if updating an existing player)
      await setDoc(playerRef, newPlayerData, { merge: true });

      // Update the local table instantly
      setPlayers((prev) => {
        const existingIndex = prev.findIndex((p) => p.id === cleanId);
        if (existingIndex >= 0) {
          // Update existing
          const updated = [...prev];
          updated[existingIndex] = { id: cleanId, ...newPlayerData, ...prev[existingIndex] };
          return updated;
        } else {
          // Add new
          return [{ id: cleanId, ...newPlayerData }, ...prev];
        }
      });

      // Close modal and reset form
      setIsModalOpen(false);
      setFormData({ id: "", name: "", mobile: "", category: "B", playsSingles: false, playsDoubles: false });
    } catch (error) {
      console.error("Error saving player:", error);
      setModalError("Failed to save player to database.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Apply Search and Filters
  const filteredPlayers = players.filter((player) => {
    const matchesSearch = 
      player.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
      player.id?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = 
      filterType === "all" ? true :
      filterType === "singles" ? player.playsSingles === true :
      filterType === "doubles" ? player.playsDoubles === true : true;

    const matchesCategory = 
      filterCategory === "all" ? true : 
      player.category?.toUpperCase() === filterCategory.toUpperCase();

    return matchesSearch && matchesType && matchesCategory;
  });

  return (
    <>
      {/* 1. Main Page Container */}
      <div className="max-w-6xl mx-auto p-6 mt-10">
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Player Roster</h1>
            <p className="text-gray-500 mt-1">Total Registered: {players.length}</p>
          </div>
          
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded flex items-center gap-2 transition-colors"
          >
            <UserPlus size={18} />
            Add Player Manually
          </button>
        </div>

        {/* Filters & Search Bar */}
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6 flex flex-col md:flex-row gap-4 items-center">
          <div className="relative flex-grow w-full md:w-auto">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="Search by Name or MHT ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <select 
            value={filterType} 
            onChange={(e) => setFilterType(e.target.value)}
            className="border border-gray-300 rounded-md px-4 py-2 w-full md:w-auto focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="all">All Tournaments</option>
            <option value="singles">Singles Only</option>
            <option value="doubles">Doubles Only</option>
          </select>

          <select 
            value={filterCategory} 
            onChange={(e) => setFilterCategory(e.target.value)}
            className="border border-gray-300 rounded-md px-4 py-2 w-full md:w-auto focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="all">All Categories</option>
            <option value="A">Category A (Top Seed)</option>
            <option value="B">Category B (Noobie)</option>
          </select>
        </div>

        {/* Data Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="py-3 px-4 text-sm font-semibold text-gray-600">MHT ID</th>
                  <th className="py-3 px-4 text-sm font-semibold text-gray-600">Name</th>
                  <th className="py-3 px-4 text-sm font-semibold text-gray-600">Mobile</th>
                  <th className="py-3 px-4 text-sm font-semibold text-gray-600 text-center">Category</th>
                  <th className="py-3 px-4 text-sm font-semibold text-gray-600 text-center">Singles</th>
                  <th className="py-3 px-4 text-sm font-semibold text-gray-600 text-center">Doubles</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan="6" className="py-8 text-center text-gray-500">
                      Loading players...
                    </td>
                  </tr>
                ) : filteredPlayers.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="py-8 text-center text-gray-500">
                      No players found matching your filters.
                    </td>
                  </tr>
                ) : (
                  filteredPlayers.map((player) => (
                    <tr key={player.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-4 text-sm font-medium text-gray-900">{player.id}</td>
                      <td className="py-3 px-4 text-sm text-gray-800 font-semibold">{player.name}</td>
                      <td className="py-3 px-4 text-sm text-gray-600">{player.mobile || "-"}</td>
                      <td className="py-3 px-4 text-sm text-center">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          player.category?.toUpperCase() === 'A' ? 'bg-purple-100 text-purple-800' : 
                          player.category?.toUpperCase() === 'B' ? 'bg-green-100 text-green-800' : 
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {player.category || "?"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-center">
                        {player.playsSingles ? (
                          <div className="flex justify-center text-blue-600"><Trophy size={18} /></div>
                        ) : <span className="text-gray-300">-</span>}
                      </td>
                      <td className="py-3 px-4 text-sm text-center">
                        {player.playsDoubles ? (
                          <div className="flex justify-center text-orange-500"><Users size={18} /></div>
                        ) : <span className="text-gray-300">-</span>}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div> {/* <-- Notice the main div ends here now! */}

      {/* 2. ADD PLAYER MODAL (Outside the main container) */}
      {isModalOpen && (
        <div className="fixed top-0 left-0 w-screen h-screen bg-black bg-opacity-60 flex items-center justify-center p-4 z-[100] backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-lg font-bold text-gray-800">Add Player Manually</h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-gray-500 hover:text-gray-800 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleManualAdd} className="p-6">
              {modalError && (
                <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded border border-red-200">
                  {modalError}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">MHT ID *</label>
                  <input 
                    type="text" 
                    required
                    value={formData.id}
                    onChange={(e) => setFormData({...formData, id: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="e.g. 1042"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                  <input 
                    type="text" 
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mobile (Optional)</label>
                  <input 
                    type="text" 
                    value={formData.mobile}
                    onChange={(e) => setFormData({...formData, mobile: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="radio" 
                        name="category" 
                        value="A" 
                        checked={formData.category === "A"}
                        onChange={(e) => setFormData({...formData, category: e.target.value})}
                      /> A (Top Seed)
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="radio" 
                        name="category" 
                        value="B" 
                        checked={formData.category === "B"}
                        onChange={(e) => setFormData({...formData, category: e.target.value})}
                      /> B (Noobie)
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Tournaments *</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={formData.playsSingles}
                        onChange={(e) => setFormData({...formData, playsSingles: e.target.checked})}
                        className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                      /> Singles
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={formData.playsDoubles}
                        onChange={(e) => setFormData({...formData, playsDoubles: e.target.checked})}
                        className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                      /> Doubles
                    </label>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex justify-end gap-3">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded font-medium transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? "Saving..." : "Save Player"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}