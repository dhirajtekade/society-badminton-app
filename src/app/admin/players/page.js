"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import { Search, Users, Database, Trophy, Shield } from "lucide-react";
import { useTournament } from "@/components/TournamentSelector";

export default function AdminPlayersPage() {
  const { tournaments, isLoading: tLoading } = useTournament();
  const [players, setPlayers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // "master" loads the global database, otherwise it loads a specific tournament ID
  const [viewMode, setViewMode] = useState("master"); 
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const fetchPlayers = async () => {
      setIsLoading(true);
      try {
        // 1. ALWAYS FETCH MASTER (The Single Source of Truth)
        const masterSnap = await getDocs(collection(db, "players"));
        const masterDict = {};
        masterSnap.forEach(doc => {
          masterDict[doc.id] = doc.data();
        });

        let list = [];

        if (viewMode === "master") {
          // If viewing Master, just show the master list
          list = Object.keys(masterDict).map(id => ({ id, ...masterDict[id] }));
        } else {
          // 2. If viewing a Tournament, fetch the roster but FORCE Master Data overrides
          const querySnapshot = await getDocs(collection(db, "tournaments", viewMode, "players"));
          querySnapshot.forEach((doc) => {
            const tData = doc.data();
            const mData = masterDict[doc.id] || {};
            
            // STRICT OVERRIDE: Ignore whatever category is in the tournament document
            // and forcefully pull it from the master dictionary.
            list.push({ 
              id: doc.id, 
              ...tData, // Keeps tournament specific fields like enrolledAt, playsSingles, etc.
              name: mData.name || tData.name || "Unknown",
              category: mData.category || tData.category || "", // Strict Master Override
              mobile: mData.mobile || tData.mobile || "" // Strict Master Override
            });
          });
        }
        
        // Sort alphabetically by name
        list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        setPlayers(list);
      } catch (error) {
        console.error("Error fetching players:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPlayers();
  }, [viewMode]);

  // Search filter
  const filteredPlayers = players.filter(p => 
    (p.name?.toLowerCase().includes(searchQuery.toLowerCase())) || 
    (p.id?.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (p.mobile?.includes(searchQuery))
  );

  if (tLoading) return <div className="p-10 text-center text-gray-500">Loading directory...</div>;

  return (
    <div className="max-w-7xl mx-auto p-6 mt-10">
      
      {/* --- HEADER --- */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
            <Users className="text-indigo-600" size={32} /> 
            Player Directory
          </h1>
          <p className="text-gray-500 mt-1">View the master database or filter by tournament enrollment.</p>
        </div>
      </div>

      {/* --- CONTROL BAR --- */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 flex flex-wrap gap-4 items-center justify-between">
        
        {/* Source Toggle */}
        <div className="flex items-center gap-3">
          <div className="bg-gray-100 p-2 rounded-lg text-gray-600">
            {viewMode === "master" ? <Database size={20} /> : <Trophy size={20} className="text-yellow-600" />}
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-gray-500 uppercase">Data Source</span>
            <select 
              value={viewMode} 
              onChange={e => setViewMode(e.target.value)}
              className="bg-transparent font-bold text-gray-800 outline-none cursor-pointer text-sm"
            >
              <option value="master">Master Database (All Players)</option>
              {tournaments.map(t => (
                <option key={t.id} value={t.id}>Enrollments: {t.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Search Bar */}
        <div className="flex-1 max-w-md relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search size={16} className="text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Search by Name, MHT ID, or Phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
          />
        </div>

        <div className="text-sm font-semibold text-gray-500">
          Total: <span className="text-indigo-600 font-bold">{filteredPlayers.length}</span>
        </div>
      </div>

      {/* --- TABLE VIEW --- */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <p className="text-center p-12 text-gray-500 font-medium">Fetching records...</p>
        ) : filteredPlayers.length === 0 ? (
          <div className="text-center p-12 text-gray-500">
            <Shield size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="font-medium text-lg">No players found.</p>
            <p className="text-sm mt-1">Try adjusting your search or selecting a different data source.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">
                  <th className="p-4">MHT ID</th>
                  <th className="p-4">Player Name</th>
                  <th className="p-4">Category</th>
                  <th className="p-4">Formats Played</th>
                  <th className="p-4">Mobile</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {filteredPlayers.map((player) => (
                  <tr key={player.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="p-4 font-mono text-gray-500 font-medium">
                      {player.id}
                    </td>
                    <td className="p-4 font-bold text-gray-900">
                      <div className="flex items-center gap-3">
                        {/* Tiny Avatar Bubble */}
                        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                          {player.name ? player.name.charAt(0).toUpperCase() : "?"}
                        </div>
                        {player.name || "Unknown"}
                      </div>
                    </td>
                    <td className="p-4">
                      {player.category ? (
                        <span className="bg-gray-100 text-gray-700 font-bold px-2 py-1 rounded text-xs border border-gray-200">
                          {player.category}
                        </span>
                      ) : (
                        <span className="text-gray-400 italic text-xs">Unassigned</span>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex gap-2">
                        {player.playsSingles && (
                          <span className="bg-blue-50 text-blue-700 font-bold px-2 py-1 rounded text-[10px] uppercase tracking-wider border border-blue-100">
                            Singles
                          </span>
                        )}
                        {player.playsDoubles && (
                          <span className="bg-orange-50 text-orange-700 font-bold px-2 py-1 rounded text-[10px] uppercase tracking-wider border border-orange-100">
                            Doubles
                          </span>
                        )}
                        {!player.playsSingles && !player.playsDoubles && (
                          <span className="text-gray-400 text-xs italic">-</span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-gray-600 font-medium">
                      {player.mobile || <span className="text-gray-400 italic">Not provided</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}