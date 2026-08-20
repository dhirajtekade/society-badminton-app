"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { Trophy, MonitorPlay, Minus, Plus, Save, Flag, AlertCircle, Search, Calendar, ArrowLeftRight } from "lucide-react";
import { useTournament } from "@/components/TournamentSelector";

export default function AdminScorerPage() {
  const { tournaments, activeTournament, switchTournament, isLoading: tLoading } = useTournament();
  
  const [matches, setMatches] = useState([]);
  const [players, setPlayers] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [winningScore, setWinningScore] = useState(15); 
  const [isSwapped, setIsSwapped] = useState(false); // <-- NEW: Tracks visual court sides

  // Filter States
  const [filterDate, setFilterDate] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch Matches and Players
  useEffect(() => {
    if (!activeTournament) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const masterSnap = await getDocs(collection(db, "players"));
        const masterDict = {};
        masterSnap.forEach(doc => masterDict[doc.id] = doc.data());

        const playersSnap = await getDocs(collection(db, "tournaments", activeTournament.id, "players"));
        const playersDict = {};
        playersSnap.forEach((doc) => {
          const tData = doc.data();
          const mData = masterDict[doc.id] || {};
          playersDict[doc.id] = { 
            name: mData.name || tData.name || "Unknown",
            category: mData.category || "Unassigned"
          };
        });
        setPlayers(playersDict);

        const matchesSnap = await getDocs(collection(db, "tournaments", activeTournament.id, "matches"));
        const fetchedMatches = [];
        matchesSnap.forEach((doc) => {
          fetchedMatches.push({ id: doc.id, ...doc.data() });
        });
        
        fetchedMatches.sort((a, b) => (a.timeSlot || "").localeCompare(b.timeSlot || ""));
        setMatches(fetchedMatches);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [activeTournament]);

  const handleSelectMatch = (matchId) => {
    if (!matchId) {
      setSelectedMatch(null);
      return;
    }
    const match = matches.find(m => m.id === matchId);
    setSelectedMatch(match);
    setScoreA(match?.scoreA || 0);
    setScoreB(match?.scoreB || 0);
    setIsSwapped(false); // Reset sides when picking a new match
  };

  const updateLiveScore = async (newA, newB) => {
    if (!selectedMatch) return;
    setScoreA(newA);
    setScoreB(newB);
    
    try {
      await updateDoc(doc(db, "tournaments", activeTournament.id, "matches", selectedMatch.id), {
        scoreA: newA,
        scoreB: newB,
        status: "ongoing",
        updatedAt: new Date().toISOString()
      });
      
      setMatches(prev => prev.map(m => m.id === selectedMatch.id ? { ...m, scoreA: newA, scoreB: newB, status: "ongoing" } : m));
    } catch (error) {
      console.error("Failed to sync score:", error);
    }
  };

 const handleEndMatch = async () => {
    // Removed the confirm() popup
    setIsSaving(true);
    
    try {
      await updateDoc(doc(db, "tournaments", activeTournament.id, "matches", selectedMatch.id), {
        scoreA,
        scoreB,
        status: "completed",
        completedAt: new Date().toISOString()
      });
      
      // Removed the success alert() popup
      
      // Update local state and clear active scorer instantly
      setMatches(prev => prev.map(m => m.id === selectedMatch.id ? { ...m, scoreA, scoreB, status: "completed" } : m));
      setSelectedMatch(null);
    } catch (error) {
      console.error("Error finishing match:", error);
      alert("Failed to save completed match."); // Keeping error alert just in case of network failure
    } finally {
      setIsSaving(false);
    }
  };

  const getPlayerDisplay = (id) => players[id]?.name || id || "TBD";

  // Filter Logic
  const pendingMatches = matches.filter(m => m.status !== "completed");
  
  const uniqueDates = [...new Set(pendingMatches.map(m => {
    if (!m.timeSlot) return "TBD";
    return m.timeSlot.split('|')[0].trim();
  }))].filter(d => d !== "TBD");

  const filteredMatches = pendingMatches.filter(m => {
    const matchDate = m.timeSlot ? m.timeSlot.split('|')[0].trim() : "TBD";
    const passesDate = filterDate === "all" || matchDate === filterDate;
    
    const p1Names = m.teamA.map(id => getPlayerDisplay(id).toLowerCase()).join(" ");
    const p2Names = m.teamB.map(id => getPlayerDisplay(id).toLowerCase()).join(" ");
    const searchLower = searchQuery.toLowerCase();
    const passesSearch = p1Names.includes(searchLower) || p2Names.includes(searchLower);

    return passesDate && passesSearch;
  });

  // --- DYNAMIC SCORING PANEL RENDERER ---
  // This helper builds the UI for a team so we can easily swap them!
  const renderTeamPanel = (teamType, isLeft) => {
    const isTeamA = teamType === 'A';
    const teamIds = isTeamA ? selectedMatch.teamA : selectedMatch.teamB;
    const score = isTeamA ? scoreA : scoreB;
    
    // Style configurations based on Team A (Blue) vs Team B (Red)
    const bgClass = isTeamA ? 'bg-blue-50/30' : 'bg-red-50/30';
    const textClass = isTeamA ? 'text-blue-900' : 'text-red-900';
    const scoreClass = isTeamA ? 'text-blue-600' : 'text-red-600';
    const btnClass = isTeamA ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700';

    const decreaseScore = () => isTeamA 
      ? updateLiveScore(Math.max(0, scoreA - 1), scoreB) 
      : updateLiveScore(scoreA, Math.max(0, scoreB - 1));
      
    const increaseScore = () => isTeamA 
      ? updateLiveScore(scoreA + 1, scoreB) 
      : updateLiveScore(scoreA, scoreB + 1);

    const minusBtn = (
      <button key="minus" onClick={decreaseScore} className="flex-1 bg-white border-2 border-gray-200 hover:bg-gray-50 text-gray-600 p-3 md:p-4 rounded-xl flex justify-center active:scale-95 transition-transform">
        <Minus size={24} />
      </button>
    );

    const plusBtn = (
      <button key="plus" onClick={increaseScore} className={`flex-[2] text-white p-3 md:p-4 rounded-xl shadow-md flex justify-center active:scale-95 transition-transform ${btnClass}`}>
        <Plus size={28} />
      </button>
    );

    return (
      <div className={`p-4 md:p-6 flex flex-col items-center flex-1 ${bgClass}`}>
        <h2 className={`text-center font-bold mb-6 h-12 flex items-center justify-center text-sm md:text-base ${textClass}`}>
          {teamIds.map(id => getPlayerDisplay(id)).join(" & ")}
        </h2>
        <div className={`text-7xl md:text-8xl font-black tracking-tighter mb-8 ${scoreClass}`}>
          {score}
        </div>
        {/* Ergonomic thumbs: [ - ] [ + ] on left side, [ + ] [ - ] on right side */}
        <div className="flex w-full gap-2 md:gap-3">
          {isLeft ? [minusBtn, plusBtn] : [plusBtn, minusBtn]}
        </div>
      </div>
    );
  };

  if (tLoading) return <div className="p-10 text-center text-gray-500">Loading scorer...</div>;

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 mt-6">
      
      {/* --- HEADER --- */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 bg-indigo-900 text-white p-4 rounded-xl shadow-md">
        <div className="flex items-center gap-3">
          <MonitorPlay size={28} className="text-yellow-400" />
          <div>
            <h1 className="text-xl font-black tracking-tight">Live Scorer</h1>
            <p className="text-xs font-bold text-indigo-300 uppercase">Referee Dashboard</p>
          </div>
        </div>
        <select 
          value={activeTournament?.id || ""} 
          onChange={e => { switchTournament(e.target.value); setSelectedMatch(null); setFilterDate("all"); setSearchQuery(""); }}
          className="bg-indigo-800 text-white border border-indigo-700 p-2 rounded-lg text-sm font-bold outline-none cursor-pointer w-full md:w-auto"
        >
          {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="text-center p-12 text-gray-500">Loading matches...</div>
      ) : (
        <div className="space-y-6">
          
          {/* --- MATCH SELECTOR & FILTERS --- */}
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
            <div className="flex flex-col md:flex-row gap-4 mb-4">
              <div className="flex-1 relative">
                <Search size={16} className="absolute left-3 top-3 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="Search player name..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 transition-colors bg-gray-50 focus:bg-white"
                />
              </div>
              <div className="flex-1 relative">
                <Calendar size={16} className="absolute left-3 top-3 text-gray-400" />
                <select 
                  value={filterDate} 
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 transition-colors bg-gray-50 focus:bg-white cursor-pointer"
                >
                  <option value="all">All Upcoming Dates</option>
                  {uniqueDates.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>

            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Select Active Match</label>
            <select 
              value={selectedMatch?.id || ""}
              onChange={(e) => handleSelectMatch(e.target.value)}
              className="w-full border-2 border-gray-200 p-3 rounded-lg text-sm font-semibold outline-none focus:border-indigo-500 transition-colors bg-white cursor-pointer"
            >
              <option value="">-- Choose a match to score --</option>
              {filteredMatches.map(m => (
                <option key={m.id} value={m.id}>
                  {m.timeSlot} | {m.teamA.map(id => getPlayerDisplay(id)).join(" & ")} VS {m.teamB.map(id => getPlayerDisplay(id)).join(" & ")}
                </option>
              ))}
            </select>
            {filteredMatches.length === 0 && (
              <p className="text-xs text-red-500 mt-2 font-medium">No matches found matching your filters.</p>
            )}
          </div>

          {/* --- SCORING INTERFACE --- */}
          {selectedMatch && (
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
              
              {/* Match Info Bar */}
              <div className="bg-gray-50 border-b border-gray-200 p-4 flex justify-between items-center flex-wrap gap-3">
                <div>
                  <span className="bg-indigo-100 text-indigo-800 text-xs font-bold px-2 py-1 rounded uppercase tracking-wider">{selectedMatch.stage}</span>
                </div>
                
                {/* Visual Swap Button */}
                <button 
                  onClick={() => setIsSwapped(!isSwapped)}
                  className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm hover:bg-gray-100 active:scale-95 transition-all"
                >
                  <ArrowLeftRight size={14} />
                  Swap Sides
                </button>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-500 uppercase">Game Pt:</span>
                  <select 
                    value={winningScore} 
                    onChange={e => setWinningScore(Number(e.target.value))}
                    className="border border-gray-300 p-1 rounded-md text-xs font-bold cursor-pointer outline-none focus:border-indigo-500"
                  >
                    <option value={15}>15</option>
                    <option value={21}>21</option>
                    <option value={30}>30</option>
                  </select>
                </div>
              </div>

              {/* Score Boards - DYNAMICALLY RENDERED */}
              <div className="flex divide-x divide-gray-200">
                {isSwapped ? renderTeamPanel('B', true) : renderTeamPanel('A', true)}
                {isSwapped ? renderTeamPanel('A', false) : renderTeamPanel('B', false)}
              </div>

              {/* Game Point Warning */}
              {(scoreA >= winningScore - 1 || scoreB >= winningScore - 1) && (
                <div className="bg-yellow-50 text-yellow-800 p-3 text-center text-sm font-bold flex items-center justify-center gap-2 border-t border-yellow-200 animate-pulse">
                  <AlertCircle size={18} /> Match Point!
                </div>
              )}

              {/* Action Bar */}
              <div className="bg-gray-800 p-4 flex justify-between items-center">
                <div className="text-gray-400 text-xs font-bold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                  Live Sync
                </div>
                <button 
                  onClick={handleEndMatch}
                  disabled={isSaving}
                  className="bg-green-500 hover:bg-green-600 text-gray-900 font-black px-4 md:px-6 py-2.5 md:py-3 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50 text-sm md:text-base"
                >
                  <Flag size={20} />
                  {isSaving ? "Finalizing..." : "Finish Match"}
                </button>
              </div>

            </div>
          )}
        </div>
      )}
    </div>
  );
}