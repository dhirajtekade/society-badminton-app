"use client";

import { useState, useEffect, useMemo } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  writeBatch,
} from "firebase/firestore"; // Added writeBatch
import {
  Trophy,
  Search,
  User,
  Activity,
  Medal,
  Swords,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  X,
  Plus, // Added Plus icon
} from "lucide-react";
import { useTournament } from "@/components/TournamentSelector";

export default function AdminPlayersDirectory() {
  const {
    tournaments,
    activeTournament,
    switchTournament,
    isLoading: tLoading,
  } = useTournament();

  const [playersList, setPlayersList] = useState([]);
  const [matchesList, setMatchesList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  // --- QUICK ADD STATE ---
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newPlayer, setNewPlayer] = useState({
    mhtId: "",
    name: "",
    mobile: "",
    category: "",
    playsSingles: true,
    playsDoubles: false,
  });

  // 1. Fetch Data for Active Tournament
  useEffect(() => {
    if (!activeTournament) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        // Fetch Master Players
        const masterSnap = await getDocs(collection(db, "players"));
        const masterDict = {};
        masterSnap.forEach((doc) => (masterDict[doc.id] = doc.data()));

        // Fetch Enrolled Players
        const enrolledSnap = await getDocs(
          collection(db, "tournaments", activeTournament.id, "players"),
        );
        const pList = [];
        enrolledSnap.forEach((doc) => {
          const tData = doc.data();
          const mData = masterDict[doc.id] || {};
          pList.push({
            id: doc.id,
            name: mData.name || tData.name || "Unknown",
            category: mData.category || "Uncategorized",
            playsSingles: tData.playsSingles || false,
            playsDoubles: tData.playsDoubles || false,
            mobile: mData.mobile || "N/A",
          });
        });
        setPlayersList(pList);

        // Fetch Matches
        const matchesSnap = await getDocs(
          collection(db, "tournaments", activeTournament.id, "matches"),
        );
        const mList = [];
        matchesSnap.forEach((doc) => {
          mList.push({ id: doc.id, ...doc.data() });
        });

        // Sort matches by time for history timeline
        mList.sort(
          (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0),
        );
        setMatchesList(mList);
      } catch (error) {
        console.error("Error fetching directory data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [activeTournament]);

  // 2. The Dual-Rank Math Engine
  const { singlesStats, doublesStats } = useMemo(() => {
    const computeStats = (targetType) => {
      const stats = {};
      const completedMatches = matchesList.filter(
        (m) => m.type === targetType && m.status === "completed",
      );

      completedMatches.forEach((m) => {
        const processTeam = (teamIds, ownScore, oppScore, won, walkover) => {
          teamIds.forEach((id) => {
            if (!stats[id]) {
              stats[id] = {
                played: 0,
                wins: 0,
                losses: 0,
                pointsFor: 0,
                pointsAgainst: 0,
              };
            }
            stats[id].played += 1;
            stats[id].pointsFor += walkover ? 0 : ownScore;
            stats[id].pointsAgainst += walkover ? 0 : oppScore;
            if (won) stats[id].wins += 1;
            else stats[id].losses += 1;
          });
        };

        const teamAWon = m.walkover === "A" || m.scoreA > m.scoreB;
        const teamBWon = m.walkover === "B" || m.scoreB > m.scoreA;

        processTeam(m.teamA, m.scoreA, m.scoreB, teamAWon, m.walkover);
        processTeam(m.teamB, m.scoreB, m.scoreA, teamBWon, m.walkover);
      });

      // Calculate Rank Score and Sort
      const rankedArray = Object.keys(stats)
        .map((id) => {
          const p = stats[id];
          const pointDiff = p.pointsFor - p.pointsAgainst;
          const rankScore = p.wins * 10000 + pointDiff * 100 + p.pointsFor;
          return { id, ...p, pointDiff, rankScore };
        })
        .sort((a, b) => b.rankScore - a.rankScore);

      // Convert array to dictionary with assigned ranks
      const finalDict = {};
      rankedArray.forEach((p, index) => {
        finalDict[p.id] = { ...p, rank: index + 1 };
      });

      return finalDict;
    };

    return {
      singlesStats: computeStats("singles"),
      doublesStats: computeStats("doubles"),
    };
  }, [matchesList]);

  // 3. Search Filter
  const filteredPlayers = playersList
    .filter(
      (p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.category.toLowerCase().includes(searchQuery.toLowerCase()),
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  // --- QUICK ADD LOGIC ---
  const handleAddPlayer = async (e) => {
    e.preventDefault();
    if (!newPlayer.mhtId.trim() || !newPlayer.name.trim()) {
      alert("MHT ID and Name are required.");
      return;
    }

    setIsAdding(true);
    try {
      const cleanMhtid = newPlayer.mhtId.trim().toUpperCase();
      const cleanName = newPlayer.name.trim();
      const cleanCategory = newPlayer.category.trim() || "Uncategorized";
      const batch = writeBatch(db);

      // 1. Update/Set Master Profile
      const playerRef = doc(db, "players", cleanMhtid);
      batch.set(
        playerRef,
        {
          name: cleanName,
          mobile: newPlayer.mobile.trim(),
          category: cleanCategory,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );

      // 2. Set Tournament Enrollment
      const enrollmentRef = doc(
        db,
        "tournaments",
        activeTournament.id,
        "players",
        cleanMhtid,
      );
      batch.set(
        enrollmentRef,
        {
          playsSingles: newPlayer.playsSingles,
          playsDoubles: newPlayer.playsDoubles,
          enrolledAt: new Date().toISOString(),
        },
        { merge: true },
      );

      await batch.commit();

      // 3. Optimistically update local state so the UI refreshes instantly
      const newPlayerObj = {
        id: cleanMhtid,
        name: cleanName,
        category: cleanCategory,
        playsSingles: newPlayer.playsSingles,
        playsDoubles: newPlayer.playsDoubles,
        mobile: newPlayer.mobile.trim() || "N/A",
      };

      setPlayersList((prev) => {
        const existingIndex = prev.findIndex((p) => p.id === cleanMhtid);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = newPlayerObj;
          return updated;
        }
        return [...prev, newPlayerObj];
      });

      // Reset Modal
      setIsAddModalOpen(false);
      setNewPlayer({
        mhtId: "",
        name: "",
        mobile: "",
        category: "",
        playsSingles: true,
        playsDoubles: false,
      });
    } catch (error) {
      console.error("Error saving new player:", error);
      alert("Failed to add player. Please check the console.");
    } finally {
      setIsAdding(false);
    }
  };

  // --- SUB-COMPONENTS FOR PROFILE MODAL ---
  const StatCard = ({ title, stats, typeLabel }) => {
    if (!stats)
      return (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-col items-center justify-center text-gray-400 min-h-[120px]">
          <div className="text-xs font-bold uppercase tracking-widest mb-1">
            {typeLabel}
          </div>
          <div className="text-sm">No matches played</div>
        </div>
      );

    return (
      <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-4 relative overflow-hidden">
        <div
          className={`absolute top-0 left-0 w-full h-1 ${typeLabel === "Singles" ? "bg-blue-500" : "bg-emerald-500"}`}
        ></div>

        <div className="flex justify-between items-start mb-4">
          <div className="text-xs font-black text-gray-500 uppercase tracking-widest">
            {typeLabel} Overview
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              Tournament Rank
            </span>
            <div className="flex items-center gap-1 text-xl font-black text-gray-900">
              <Medal
                size={18}
                className={
                  stats.rank === 1
                    ? "text-yellow-400"
                    : stats.rank === 2
                      ? "text-slate-400"
                      : stats.rank === 3
                        ? "text-amber-600"
                        : "text-gray-300"
                }
              />
              #{stats.rank}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-gray-50 p-2 rounded text-center">
            <div className="text-[10px] font-bold text-gray-500 uppercase">
              Played
            </div>
            <div className="text-lg font-black text-gray-800">
              {stats.played}
            </div>
          </div>
          <div className="bg-emerald-50 p-2 rounded text-center">
            <div className="text-[10px] font-bold text-emerald-600 uppercase">
              Win / Loss
            </div>
            <div className="text-lg font-black text-emerald-700">
              {stats.wins} - {stats.losses}
            </div>
          </div>
          <div
            className={`p-2 rounded text-center ${stats.pointDiff > 0 ? "bg-blue-50" : stats.pointDiff < 0 ? "bg-red-50" : "bg-gray-50"}`}
          >
            <div
              className={`text-[10px] font-bold uppercase ${stats.pointDiff > 0 ? "text-blue-600" : stats.pointDiff < 0 ? "text-red-600" : "text-gray-500"}`}
            >
              Pt Diff
            </div>
            <div
              className={`text-lg font-black flex items-center justify-center gap-0.5 ${stats.pointDiff > 0 ? "text-blue-700" : stats.pointDiff < 0 ? "text-red-700" : "text-gray-700"}`}
            >
              {stats.pointDiff > 0 ? (
                <TrendingUp size={14} />
              ) : stats.pointDiff < 0 ? (
                <TrendingDown size={14} />
              ) : null}
              {stats.pointDiff > 0 ? `+${stats.pointDiff}` : stats.pointDiff}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const getPlayerName = (id) =>
    playersList.find((p) => p.id === id)?.name || id;

  if (tLoading)
    return (
      <div className="p-10 text-center text-gray-500">Loading directory...</div>
    );

  return (
    <>
      <div className="max-w-6xl mx-auto p-4 md:p-6 mt-6">
        {/* HEADER */}
        <div className="bg-indigo-900 text-white p-5 rounded-xl shadow-md mb-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-white/10 p-3 rounded-lg">
              <User size={28} className="text-emerald-400" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-indigo-300">
                Player Directory & Analytics
              </div>
              <h1 className="text-2xl font-black">{activeTournament?.name}</h1>
            </div>
          </div>

          <select
            value={activeTournament?.id || ""}
            onChange={(e) => switchTournament(e.target.value)}
            className="bg-indigo-800 text-white border border-indigo-700 p-2.5 rounded-lg font-bold outline-none cursor-pointer w-full md:w-auto"
          >
            {tournaments.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {/* CONTROLS */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 flex flex-col sm:flex-row justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search size={18} className="absolute left-3 top-3 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, MHT ID, or category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          <div className="flex items-center gap-4">
            <div className="text-sm font-semibold text-gray-500 hidden sm:block">
              Directory Size:{" "}
              <span className="text-indigo-600 font-bold ml-1">
                {filteredPlayers.length} Players
              </span>
            </div>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-lg flex items-center gap-2 text-sm shadow-sm transition-colors"
            >
              <Plus size={16} /> Add Player
            </button>
          </div>
        </div>

        {/* MAIN TABLE */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center text-gray-400 animate-pulse">
              Analyzing player statistics...
            </div>
          ) : filteredPlayers.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              No players found in this tournament.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-xs font-black text-gray-500 uppercase tracking-widest">
                    <th className="p-4 pl-6">Player</th>
                    <th className="p-4">Enrollment</th>
                    <th className="p-4 text-center">Singles Rank</th>
                    <th className="p-4 text-center">Doubles Rank</th>
                    <th className="p-4 text-right pr-6">Profile</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredPlayers.map((player) => {
                    const sRank = singlesStats[player.id]?.rank;
                    const dRank = doublesStats[player.id]?.rank;

                    return (
                      <tr
                        key={player.id}
                        className="hover:bg-gray-50/80 transition-colors group cursor-pointer"
                        onClick={() => setSelectedPlayer(player)}
                      >
                        <td className="p-4 pl-6">
                          <div className="font-bold text-gray-900">
                            {player.name}
                          </div>
                          <div className="text-xs font-mono text-gray-400 mt-0.5">
                            {player.id}
                          </div>
                        </td>
                        <td className="p-4">
                          <span className="bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded inline-block mb-1 mr-2">
                            {player.category}
                          </span>
                          <div className="flex gap-1">
                            {player.playsSingles && (
                              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 rounded">
                                S
                              </span>
                            )}
                            {player.playsDoubles && (
                              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 rounded">
                                D
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-4 text-center">
                          {sRank ? (
                            <span
                              className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-black text-sm ${sRank === 1 ? "bg-yellow-100 text-yellow-600 border border-yellow-200" : "bg-gray-100 text-gray-600"}`}
                            >
                              {sRank}
                            </span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                        <td className="p-4 text-center">
                          {dRank ? (
                            <span
                              className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-black text-sm ${dRank === 1 ? "bg-yellow-100 text-yellow-600 border border-yellow-200" : "bg-gray-100 text-gray-600"}`}
                            >
                              {dRank}
                            </span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                        <td className="p-4 text-right pr-6 text-indigo-300 group-hover:text-indigo-600 transition-colors">
                          <ChevronRight size={20} className="inline" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* --- QUICK ADD PLAYER MODAL --- */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[9999] overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="font-black text-lg text-gray-800">
                Quick Add Player
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-gray-400 hover:text-red-500 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddPlayer} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  MHT ID *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. MHT001"
                  value={newPlayer.mhtId}
                  onChange={(e) =>
                    setNewPlayer({ ...newPlayer, mhtId: e.target.value })
                  }
                  className="w-full border border-gray-300 p-2.5 rounded-lg text-sm outline-none focus:border-indigo-500 uppercase"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Player Name"
                  value={newPlayer.name}
                  onChange={(e) =>
                    setNewPlayer({ ...newPlayer, name: e.target.value })
                  }
                  className="w-full border border-gray-300 p-2.5 rounded-lg text-sm outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Mobile
                  </label>
                  <input
                    type="text"
                    placeholder="Optional"
                    value={newPlayer.mobile}
                    onChange={(e) =>
                      setNewPlayer({ ...newPlayer, mobile: e.target.value })
                    }
                    className="w-full border border-gray-300 p-2.5 rounded-lg text-sm outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Category
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Advanced"
                    value={newPlayer.category}
                    onChange={(e) =>
                      setNewPlayer({ ...newPlayer, category: e.target.value })
                    }
                    className="w-full border border-gray-300 p-2.5 rounded-lg text-sm outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-2">
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                  Enrollment Type
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer text-sm font-semibold">
                    <input
                      type="checkbox"
                      checked={newPlayer.playsSingles}
                      onChange={(e) =>
                        setNewPlayer({
                          ...newPlayer,
                          playsSingles: e.target.checked,
                        })
                      }
                      className="w-4 h-4 text-indigo-600 rounded"
                    />
                    Plays Singles
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm font-semibold">
                    <input
                      type="checkbox"
                      checked={newPlayer.playsDoubles}
                      onChange={(e) =>
                        setNewPlayer({
                          ...newPlayer,
                          playsDoubles: e.target.checked,
                        })
                      }
                      className="w-4 h-4 text-indigo-600 rounded"
                    />
                    Plays Doubles
                  </label>
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAdding}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition-colors disabled:opacity-50"
                >
                  {isAdding ? "Saving..." : "Save Player"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- ADVANCED PLAYER PROFILE MODAL --- */}
      {selectedPlayer && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[9999] overflow-y-auto">
          <div className="bg-slate-50 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-white border-b border-gray-200 p-6 flex justify-between items-start relative overflow-hidden">
              <div className="absolute -right-10 -top-10 text-gray-50 opacity-50 pointer-events-none">
                <Activity size={180} />
              </div>
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-1">
                  <span className="bg-indigo-100 text-indigo-800 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded border border-indigo-200">
                    {selectedPlayer.category}
                  </span>
                  <span className="text-xs font-mono font-bold text-gray-400">
                    ID: {selectedPlayer.id}
                  </span>
                </div>
                <h2 className="text-3xl font-black text-gray-900 tracking-tight">
                  {selectedPlayer.name}
                </h2>
                <div className="text-sm font-semibold text-gray-500 mt-1 flex items-center gap-2">
                  <span>{activeTournament?.name} Profile</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedPlayer(null)}
                className="relative z-10 bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-500 p-2 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6">
              {/* Analytics Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <StatCard
                  title="Singles"
                  stats={singlesStats[selectedPlayer.id]}
                  typeLabel="Singles"
                />
                <StatCard
                  title="Doubles"
                  stats={doublesStats[selectedPlayer.id]}
                  typeLabel="Doubles"
                />
              </div>

              {/* Match History Timeline */}
              <div>
                <h3 className="text-sm font-black text-gray-800 uppercase tracking-wider mb-4 flex items-center gap-2 border-b border-gray-200 pb-2">
                  <Swords size={18} className="text-indigo-500" /> Match History
                </h3>

                <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-2">
                  {matchesList.filter(
                    (m) =>
                      m.teamA.includes(selectedPlayer.id) ||
                      m.teamB.includes(selectedPlayer.id),
                  ).length === 0 ? (
                    <div className="text-center text-gray-500 py-6 text-sm">
                      No matches scheduled or played yet.
                    </div>
                  ) : (
                    matchesList
                      .filter(
                        (m) =>
                          m.teamA.includes(selectedPlayer.id) ||
                          m.teamB.includes(selectedPlayer.id),
                      )
                      .map((match) => {
                        const isTeamA = match.teamA.includes(selectedPlayer.id);
                        const myTeam = isTeamA ? match.teamA : match.teamB;
                        const oppTeam = isTeamA ? match.teamB : match.teamA;
                        const myScore = isTeamA ? match.scoreA : match.scoreB;
                        const oppScore = isTeamA ? match.scoreB : match.scoreA;

                        let resultIndicator = (
                          <span className="bg-gray-100 text-gray-500 text-[10px] font-bold px-2 py-0.5 rounded uppercase">
                            Scheduled
                          </span>
                        );

                        if (match.status === "completed") {
                          const won = match.walkover
                            ? match.walkover === (isTeamA ? "A" : "B")
                            : myScore > oppScore;
                          if (won) {
                            resultIndicator = (
                              <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase">
                                Won
                              </span>
                            );
                          } else {
                            resultIndicator = (
                              <span className="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase">
                                Lost
                              </span>
                            );
                          }
                        } else if (match.status === "in_progress") {
                          resultIndicator = (
                            <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase animate-pulse">
                              Live
                            </span>
                          );
                        }

                        return (
                          <div
                            key={match.id}
                            className="bg-white border border-gray-200 rounded-lg p-3 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm hover:border-indigo-300 transition-colors"
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1.5">
                                <span
                                  className={`text-[10px] font-black uppercase tracking-widest ${match.type === "singles" ? "text-blue-500" : "text-emerald-500"}`}
                                >
                                  {match.type}
                                </span>
                                <span className="text-gray-300">•</span>
                                <span className="text-[10px] font-bold text-gray-500">
                                  {match.stage}
                                </span>
                              </div>
                              <div className="text-sm font-bold text-gray-800">
                                <span className="text-gray-400 font-normal mr-2">
                                  vs
                                </span>
                                {oppTeam.map(getPlayerName).join(" & ")}
                              </div>
                              {match.type === "doubles" &&
                                myTeam.length > 1 && (
                                  <div className="text-[10px] text-gray-500 mt-1">
                                    Partnered w/{" "}
                                    {getPlayerName(
                                      myTeam.find(
                                        (id) => id !== selectedPlayer.id,
                                      ),
                                    )}
                                  </div>
                                )}
                            </div>

                            <div className="flex items-center gap-4 md:flex-row-reverse border-t md:border-t-0 border-gray-100 pt-2 md:pt-0">
                              {resultIndicator}
                              {(match.status === "completed" ||
                                match.status === "in_progress") &&
                                !match.walkover && (
                                  <div className="font-mono text-lg font-black text-gray-800">
                                    {myScore} -{" "}
                                    <span className="text-gray-400">
                                      {oppScore}
                                    </span>
                                  </div>
                                )}
                              {match.walkover && (
                                <div className="text-xs font-bold text-gray-500 italic">
                                  Walkover
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
