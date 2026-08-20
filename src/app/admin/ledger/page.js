"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import { Table, Trophy, Download } from "lucide-react";
import { useTournament } from "@/components/TournamentSelector";

export default function AdminResultsPage() {
  const { tournaments, activeTournament, switchTournament, isLoading: tLoading } = useTournament();
  const [matches, setMatches] = useState([]);
  const [players, setPlayers] = useState({});
  const [isLoading, setIsLoading] = useState(true);

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
          playersDict[doc.id] = mData.name || tData.name || "Unknown";
        });
        setPlayers(playersDict);

        const matchesSnap = await getDocs(collection(db, "tournaments", activeTournament.id, "matches"));
        const fetchedMatches = [];
        matchesSnap.forEach((doc) => {
          // Only show completed matches or walkovers in the ledger
          if (doc.data().status === "completed") {
            fetchedMatches.push({ id: doc.id, ...doc.data() });
          }
        });
        
        // Sort chronologically
        fetchedMatches.sort((a, b) => (a.timeSlot || "").localeCompare(b.timeSlot || ""));
        setMatches(fetchedMatches);
      } catch (error) {
        console.error("Error fetching results:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [activeTournament]);

  const getPlayerDisplay = (id) => players[id] || id || "TBD";
  const extractDate = (timeSlot) => timeSlot ? timeSlot.split('|')[0].trim() : "-";

  if (tLoading) return <div className="p-10 text-center text-gray-500">Loading results...</div>;

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 mt-6">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 bg-indigo-900 text-white p-4 rounded-xl shadow-md">
        <div className="flex items-center gap-3">
          <Table size={28} className="text-yellow-400" />
          <div>
            <h1 className="text-xl font-black tracking-tight">League Results Ledger</h1>
            <p className="text-xs font-bold text-indigo-300 uppercase">Master Data View</p>
          </div>
        </div>
        <div className="flex gap-3">
          <select 
            value={activeTournament?.id || ""} 
            onChange={e => switchTournament(e.target.value)}
            className="bg-indigo-800 text-white border border-indigo-700 p-2 rounded-lg text-sm font-bold outline-none cursor-pointer"
          >
            {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-gray-500">Loading ledger data...</div>
        ) : matches.length === 0 ? (
          <div className="p-12 text-center text-gray-500 font-medium">No completed matches found yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm whitespace-nowrap">
              <thead>
                <tr className="bg-gray-800 text-white text-xs uppercase tracking-wider">
                  <th className="p-3 border-r border-gray-700">No.</th>
                  <th className="p-3 border-r border-gray-700">Player 1 (Team A)</th>
                  <th className="p-3 border-r border-gray-700">Player 2 (Team B)</th>
                  <th className="p-3 border-r border-gray-700 text-center">P1 Score</th>
                  <th className="p-3 border-r border-gray-700 text-center">P2 Score</th>
                  <th className="p-3 border-r border-gray-700 text-center bg-blue-900/50">P1 Win</th>
                  <th className="p-3 border-r border-gray-700 text-center bg-red-900/50">P2 Win</th>
                  <th className="p-3 border-r border-gray-700">Remarks / Walkover</th>
                  <th className="p-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {matches.map((m, idx) => {
                  const p1Score = m.scoreA || 0;
                  const p2Score = m.scoreB || 0;
                  
                  // Logic to determine wins including walkovers
                  const p1Win = m.walkover === 'A' || (!m.walkover && p1Score > p2Score) ? 1 : 0;
                  const p2Win = m.walkover === 'B' || (!m.walkover && p2Score > p1Score) ? 1 : 0;

                  let remarks = "";
                  if (m.walkover === 'A') remarks = "Team B absent (W/O)";
                  if (m.walkover === 'B') remarks = "Team A absent (W/O)";
                  if (m.walkover === 'both') remarks = "Both absent (Void)";

                  return (
                    <tr key={m.id} className="hover:bg-gray-50">
                      <td className="p-3 border-r border-gray-200 font-bold text-gray-500 text-center">{idx + 1}</td>
                      <td className="p-3 border-r border-gray-200 font-semibold text-gray-900">
                        {m.teamA.map(id => getPlayerDisplay(id)).join(" & ")}
                      </td>
                      <td className="p-3 border-r border-gray-200 font-semibold text-gray-900">
                        {m.teamB.map(id => getPlayerDisplay(id)).join(" & ")}
                      </td>
                      <td className="p-3 border-r border-gray-200 text-center font-mono font-bold text-blue-600">{m.walkover ? "-" : p1Score}</td>
                      <td className="p-3 border-r border-gray-200 text-center font-mono font-bold text-red-600">{m.walkover ? "-" : p2Score}</td>
                      <td className="p-3 border-r border-gray-200 text-center font-bold bg-blue-50/50">{p1Win}</td>
                      <td className="p-3 border-r border-gray-200 text-center font-bold bg-red-50/50">{p2Win}</td>
                      <td className="p-3 border-r border-gray-200 text-xs italic text-gray-500 font-medium">
                        {remarks}
                      </td>
                      <td className="p-3 text-gray-500 text-xs font-medium">{extractDate(m.timeSlot)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}