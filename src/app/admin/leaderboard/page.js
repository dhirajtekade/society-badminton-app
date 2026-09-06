"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import { Trophy, Award, BarChart3, Users, LayoutList } from "lucide-react";
import { useTournament } from "@/components/TournamentSelector";

export default function AdminLeaderboardPage() {
  const { tournaments, activeTournament, switchTournament, isLoading: tLoading } = useTournament();
  
  // Stores both overall and division-wise data
  const [standings, setStandings] = useState({ overall: [], divisions: {} });
  const [isLoading, setIsLoading] = useState(true);
  
  // New Toggle State
  const [viewMode, setViewMode] = useState("overall"); // "overall" | "division"

  useEffect(() => {
    if (!activeTournament) return;

    const fetchLeaderboardData = async () => {
      setIsLoading(true);
      try {
        const masterSnap = await getDocs(collection(db, "players"));
        const masterDict = {};
        masterSnap.forEach(doc => masterDict[doc.id] = doc.data());

        const playersSnap = await getDocs(collection(db, "tournaments", activeTournament.id, "players"));
        const stats = {};

        playersSnap.forEach((doc) => {
          const playerId = doc.id;
          const tData = doc.data();
          const mData = masterDict[playerId] || {};
          
          const name = mData.name || tData.name || "Unknown";
          const category = mData.category || "Uncategorized";

          stats[playerId] = {
            id: playerId,
            name,
            category,
            matchesPlayed: 0,
            totalWins: 0,
            pointsScored: 0,
            pointsConceded: 0,
            pointDifference: 0,
            rankScore: 0,
          };
        });

        const matchesSnap = await getDocs(collection(db, "tournaments", activeTournament.id, "matches"));
        
        matchesSnap.forEach((doc) => {
          const m = doc.data();
          if (m.status !== "completed") return;

          const teamA = m.teamA || [];
          const teamB = m.teamB || [];
          const scoreA = m.scoreA || 0;
          const scoreB = m.scoreB || 0;
          const walkover = m.walkover; 

          let teamAWon = false;
          let teamBWon = false;

          if (walkover === 'A') teamAWon = true;
          else if (walkover === 'B') teamBWon = true;
          else if (walkover === 'both') return; 
          else {
            teamAWon = scoreA > scoreB;
            teamBWon = scoreB > scoreA;
          }

          teamA.forEach(id => {
            if (stats[id]) {
              stats[id].matchesPlayed += 1;
              stats[id].pointsScored += walkover ? 0 : scoreA;
              stats[id].pointsConceded += walkover ? 0 : scoreB;
              if (teamAWon) stats[id].totalWins += 1;
            }
          });

          teamB.forEach(id => {
            if (stats[id]) {
              stats[id].matchesPlayed += 1;
              stats[id].pointsScored += walkover ? 0 : scoreB;
              stats[id].pointsConceded += walkover ? 0 : scoreA;
              if (teamBWon) stats[id].totalWins += 1;
            }
          });
        });

        // Calculate Formula
        Object.values(stats).forEach(p => {
          p.pointDifference = p.pointsScored - p.pointsConceded;
          p.rankScore = (p.totalWins * 10000) + (p.pointDifference * 100) + p.pointsScored;
        });

        // 1. Generate Overall Standings (Sorted)
        const overallStandings = Object.values(stats).sort((a, b) => b.rankScore - a.rankScore);

        // 2. Generate Division-wise Standings
        const groupedByCategory = {};
        overallStandings.forEach(p => {
          const cat = p.category || "Uncategorized";
          if (!groupedByCategory[cat]) groupedByCategory[cat] = [];
          groupedByCategory[cat].push(p);
        });

        setStandings({
          overall: overallStandings,
          divisions: groupedByCategory
        });

      } catch (error) {
        console.error("Error calculating leaderboard:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLeaderboardData();
  }, [activeTournament]);

  // Reusable Table Renderer to keep code clean
  const renderTable = (title, players) => (
    <div key={title} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-indigo-50 p-4 border-b border-indigo-100 flex items-center justify-between">
        <h3 className="font-black text-indigo-900 uppercase tracking-wider flex items-center gap-2">
          <Award size={18} className="text-indigo-600" />
          {title}
        </h3>
        <span className="text-xs font-bold text-indigo-600 bg-indigo-100 px-2.5 py-1 rounded-full">
          {players.length} Players
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm whitespace-nowrap">
          <thead>
            <tr className="bg-gray-800 text-white text-xs uppercase tracking-wider">
              <th className="p-3.5 border-r border-gray-700 w-16 text-center">Rank</th>
              <th className="p-3.5 border-r border-gray-700">Player Name</th>
              {/* Show category tag in overall view to distinguish players */}
              {viewMode === "overall" && <th className="p-3.5 border-r border-gray-700">Tag</th>}
              <th className="p-3.5 border-r border-gray-700 text-center">Matches</th>
              <th className="p-3.5 border-r border-gray-700 text-center">Total Wins</th>
              <th className="p-3.5 border-r border-gray-700 text-center">Points Scored</th>
              <th className="p-3.5 border-r border-gray-700 text-center">Points Conceded</th>
              <th className="p-3.5 border-r border-gray-700 text-center">Point Diff</th>
              <th className="p-3.5 text-center bg-indigo-950">Rank Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 font-medium">
            {players.map((p, index) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="p-3.5 border-r border-gray-200 text-center font-black text-gray-800">
                  {index === 0 ? <span className="text-yellow-600">🥇 1</span> : 
                   index === 1 ? <span className="text-gray-500">🥈 2</span> : 
                   index === 2 ? <span className="text-amber-700">🥉 3</span> : 
                   index + 1}
                </td>
                <td className="p-3.5 border-r border-gray-200 font-bold text-gray-900">{p.name}</td>
                {viewMode === "overall" && (
                  <td className="p-3.5 border-r border-gray-200">
                    <span className="bg-gray-100 text-gray-600 border border-gray-200 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded">
                      {p.category}
                    </span>
                  </td>
                )}
                <td className="p-3.5 border-r border-gray-200 text-center text-gray-600">{p.matchesPlayed}</td>
                <td className="p-3.5 border-r border-gray-200 text-center font-bold text-green-600">{p.totalWins}</td>
                <td className="p-3.5 border-r border-gray-200 text-center text-gray-700">{p.pointsScored}</td>
                <td className="p-3.5 border-r border-gray-200 text-center text-gray-700">{p.pointsConceded}</td>
                <td className={`p-3.5 border-r border-gray-200 text-center font-bold font-mono ${p.pointDifference > 0 ? 'text-green-600' : p.pointDifference < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                  {p.pointDifference > 0 ? `+${p.pointDifference}` : p.pointDifference}
                </td>
                <td className="p-3.5 text-center font-mono font-bold text-indigo-700 bg-indigo-50/50">{p.rankScore}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  if (tLoading) return <div className="p-10 text-center text-gray-500">Loading leaderboard...</div>;

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 mt-6">
      
      {/* --- HEADER --- */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 bg-indigo-900 text-white p-4 rounded-xl shadow-md">
        <div className="flex items-center gap-3">
          <Trophy size={28} className="text-yellow-400" />
          <div>
            <h1 className="text-xl font-black tracking-tight">League Leaderboard & Standings</h1>
            <p className="text-xs font-bold text-indigo-300 uppercase">Weighted Scoring Algorithm</p>
          </div>
        </div>
        <select 
          value={activeTournament?.id || ""} 
          onChange={e => switchTournament(e.target.value)}
          className="bg-indigo-800 text-white border border-indigo-700 p-2 rounded-lg text-sm font-bold outline-none cursor-pointer"
        >
          {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {/* --- TOGGLE CONTROLS --- */}
      {!isLoading && standings.overall.length > 0 && (
        <div className="flex bg-gray-200 p-1 rounded-lg w-fit mb-6 border border-gray-300 shadow-inner">
          <button
            onClick={() => setViewMode("overall")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-md text-sm font-bold transition-all ${
              viewMode === "overall" ? "bg-white shadow text-indigo-700" : "text-gray-500 hover:text-gray-800"
            }`}
          >
            <Users size={16} />
            Overall Ranking
          </button>
          <button
            onClick={() => setViewMode("division")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-md text-sm font-bold transition-all ${
              viewMode === "division" ? "bg-white shadow text-indigo-700" : "text-gray-500 hover:text-gray-800"
            }`}
          >
            <LayoutList size={16} />
            Division-wise
          </button>
        </div>
      )}

      {/* --- CONTENT AREA --- */}
      {isLoading ? (
        <div className="p-12 text-center text-gray-500 font-medium">Calculating standings from match ledger...</div>
      ) : standings.overall.length === 0 ? (
        <div className="p-12 text-center text-gray-500 bg-white rounded-xl border border-gray-200 font-medium">
          No player data available for this tournament. Play some matches first!
        </div>
      ) : (
        <div className="space-y-2">
          {viewMode === "overall" 
            ? renderTable("Global Overall Standings", standings.overall)
            : Object.entries(standings.divisions).map(([categoryName, players]) => 
                renderTable(`${categoryName} Division`, players)
              )
          }
        </div>
      )}
    </div>
  );
}