"use client";

import { useState, useEffect, useMemo } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, onSnapshot } from "firebase/firestore";
import {
  Radio,
  Calendar,
  Trophy,
  Activity,
  ChevronRight,
  ListOrdered,
  Swords,
  Network,
} from "lucide-react";
import Link from "next/link";

export default function PublicLiveView() {
  const [tournaments, setTournaments] = useState([]);
  const [activeTournamentId, setActiveTournamentId] = useState("");
  const [players, setPlayers] = useState({});
  const [matches, setMatches] = useState({
    live: [],
    upcoming: [],
    completed: [],
  });
  const [isLoading, setIsLoading] = useState(true);

  const [activeTab, setActiveTab] = useState("matches");
  const [leaderboardCategory, setLeaderboardCategory] = useState("all");

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const tSnap = await getDocs(collection(db, "tournaments"));
        const tList = tSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setTournaments(tList);

        if (tList.length > 0) setActiveTournamentId(tList[0].id);

        const pSnap = await getDocs(collection(db, "players"));
        const pDict = {};
        pSnap.forEach((doc) => (pDict[doc.id] = doc.data()));
        setPlayers(pDict);
      } catch (error) {
        console.error("Error loading initial data:", error);
      }
    };
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (!activeTournamentId) return;
    setIsLoading(true);

    const q = query(
      collection(db, "tournaments", activeTournamentId, "matches"),
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const live = [];
      const upcoming = [];
      const completed = [];

      snapshot.forEach((doc) => {
        const m = { id: doc.id, ...doc.data() };
        const hasStarted =
          m.scoreA > 0 || m.scoreB > 0 || (m.sets && m.sets.length > 0);

        if (m.status === "completed") {
          completed.push(m);
        } else if (
          m.status === "in_progress" ||
          (m.status === "scheduled" && hasStarted)
        ) {
          live.push(m);
        } else if (m.status === "scheduled") {
          upcoming.push(m);
        }
      });

      live.sort((a, b) => (a.court > b.court ? 1 : -1));
      upcoming.sort((a, b) => (a.timeSlot > b.timeSlot ? 1 : -1));
      completed.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );

      setMatches({ live, upcoming, completed });
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [activeTournamentId]);

  const getPlayerName = (id) => players[id]?.name || id || "TBD";
  const formatTime = (timeStr) =>
    timeStr ? timeStr.split("-")[0].trim() : "TBD";

  // --- LEADERBOARD WITH MULTI-SET POINT ACCUMULATION ---
  const leaderboardData = useMemo(() => {
    const stats = {};

    matches.completed.forEach((m) => {
      const processTeam = (teamIds, won, walkover) => {
        let matchPointsFor = 0;
        let matchPointsAgainst = 0;

        if (m.sets && Array.isArray(m.sets) && m.sets.length > 0) {
          m.sets.forEach((set) => {
            // Determine team index based on teamIds match
            const isTeamA = m.teamA.includes(teamIds[0]);
            matchPointsFor += isTeamA ? set.scoreA || 0 : set.scoreB || 0;
            matchPointsAgainst += isTeamA ? set.scoreB || 0 : set.scoreA || 0;
          });
        } else {
          const isTeamA = m.teamA.includes(teamIds[0]);
          matchPointsFor = isTeamA ? m.scoreA || 0 : m.scoreB || 0;
          matchPointsAgainst = isTeamA ? m.scoreB || 0 : m.scoreA || 0;
        }

        teamIds.forEach((id) => {
          if (!stats[id]) {
            stats[id] = {
              id,
              name: getPlayerName(id),
              category: players[id]?.category || "Uncategorized",
              matches: 0,
              wins: 0,
              pointsFor: 0,
              pointsAgainst: 0,
            };
          }
          stats[id].matches += 1;
          stats[id].pointsFor += walkover ? 0 : matchPointsFor;
          stats[id].pointsAgainst += walkover ? 0 : matchPointsAgainst;
          if (won) stats[id].wins += 1;
        });
      };

      const teamAWon =
        m.walkover === "A" ||
        (m.sets ? m.scoreA > m.scoreB : m.scoreA > m.scoreB);
      const teamBWon =
        m.walkover === "B" ||
        (m.sets ? m.scoreB > m.scoreA : m.scoreB > m.scoreA);

      processTeam(m.teamA, teamAWon, m.walkover);
      processTeam(m.teamB, teamBWon, m.walkover);
    });

    const ranked = Object.values(stats).map((p) => {
      const pointDiff = p.pointsFor - p.pointsAgainst;
      const rankScore = p.wins * 10000 + pointDiff * 100 + p.pointsFor;
      return { ...p, pointDiff, rankScore };
    });

    ranked.sort((a, b) => b.rankScore - a.rankScore);
    return ranked;
  }, [matches.completed, players]);

  const uniqueCategories = [...new Set(leaderboardData.map((p) => p.category))];
  const displayedLeaderboard =
    leaderboardCategory === "all"
      ? leaderboardData
      : leaderboardData.filter((p) => p.category === leaderboardCategory);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 selection:bg-indigo-500/30">
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg text-white">
              <Activity size={24} />
            </div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight uppercase">
                Tournament Center
              </h1>
              <div className="flex items-center gap-2 text-xs font-bold text-red-400 uppercase tracking-widest">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
                Live Updates
              </div>
            </div>
          </div>

          {tournaments.length > 0 && (
            <select
              value={activeTournamentId}
              onChange={(e) => setActiveTournamentId(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-white p-2.5 rounded-lg text-sm font-bold outline-none focus:border-indigo-500 transition-colors w-full md:w-auto cursor-pointer"
            >
              {tournaments.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8 pb-24">
        <div className="flex gap-2 border-b border-slate-800">
          <button
            onClick={() => setActiveTab("matches")}
            className={`px-4 py-3 font-black uppercase tracking-wider text-sm transition-all flex items-center gap-2 ${activeTab === "matches" ? "text-indigo-400 border-b-2 border-indigo-400" : "text-slate-500 hover:text-slate-300"}`}
          >
            <Swords size={18} /> Matches
          </button>
          <button
            onClick={() => setActiveTab("leaderboard")}
            className={`px-4 py-3 font-black uppercase tracking-wider text-sm transition-all flex items-center gap-2 ${activeTab === "leaderboard" ? "text-amber-400 border-b-2 border-amber-400" : "text-slate-500 hover:text-slate-300"}`}
          >
            <ListOrdered size={18} /> Standings
          </button>
          <Link 
            href="/brackets" 
            className="px-4 py-3 font-black uppercase tracking-wider text-sm transition-all flex items-center gap-2 text-slate-500 hover:text-indigo-400 shrink-0"
          >
            <Network size={18} /> Brackets Tree
          </Link>
        </div>

        {isLoading ? (
          <div className="text-center py-20 text-slate-500 animate-pulse font-bold text-lg">
            Connecting to stadium feeds...
          </div>
        ) : activeTab === "matches" ? (
          <div className="space-y-12 animate-in fade-in">
            {/* QUICK LINK BANNER TO BRACKETS */}
        <Link 
          href="/brackets" 
          className="group block bg-gradient-to-r from-indigo-900/60 to-purple-900/60 border border-indigo-500/30 hover:border-indigo-500/60 p-4 rounded-2xl transition-all shadow-lg"
        >
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-600/30 text-indigo-400 p-2.5 rounded-xl border border-indigo-500/20 group-hover:scale-105 transition-transform">
                <Network size={22} />
              </div>
              <div>
                <h3 className="font-black text-white text-base tracking-tight">View Knockout Bracket Tree</h3>
                <p className="text-xs text-indigo-200/70 font-medium">Follow the path from Pre-Quarters to the Championship Final</p>
              </div>
            </div>
            <div className="text-indigo-400 group-hover:translate-x-1 transition-transform pr-2">
              <ChevronRight size={20} />
            </div>
          </div>
        </Link>
            <section>
              <h2 className="flex items-center gap-2 text-lg font-black text-white uppercase tracking-wider mb-4">
                <Radio className="text-red-500" size={20} /> Action Live
              </h2>
              {matches.live.length === 0 ? (
                <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-10 text-center text-slate-500 font-medium">
                  No matches are currently in progress.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {matches.live.map((m) => {
                    const currentSet =
                      m.sets && m.sets.length > 0
                        ? m.sets[m.sets.length - 1]
                        : null;
                    const displayA = currentSet
                      ? currentSet.scoreA
                      : m.scoreA || 0;
                    const displayB = currentSet
                      ? currentSet.scoreB
                      : m.scoreB || 0;

                    return (
                      <div
                        key={m.id}
                        className="bg-slate-900 border border-slate-700 rounded-2xl p-5 shadow-xl relative overflow-hidden"
                      >
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 to-orange-500"></div>
                        <div className="flex justify-between items-center mb-4">
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest bg-slate-800 px-2 py-1 rounded">
                            {m.court}
                          </span>
                          <div className="flex items-center gap-2">
                            {m.sets && m.sets.length > 0 && (
                              <span className="text-[10px] font-black bg-purple-900/50 text-purple-300 px-2 py-0.5 rounded border border-purple-700">
                                Sets: {m.scoreA} - {m.scoreB}
                              </span>
                            )}
                            <span className="text-xs font-black text-indigo-400 uppercase tracking-wider">
                              {m.stage}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-4">
                          <div className="flex justify-between items-center">
                            <div className="flex flex-col">
                              {m.teamA.map((id) => (
                                <span
                                  key={id}
                                  className="text-lg font-bold text-white leading-tight"
                                >
                                  {getPlayerName(id)}
                                </span>
                              ))}
                            </div>
                            <div className="text-4xl font-black text-white font-mono bg-slate-950 px-4 py-1 rounded-lg border border-slate-800">
                              {displayA}
                            </div>
                          </div>
                          <div className="w-full h-px bg-slate-800"></div>
                          <div className="flex justify-between items-center">
                            <div className="flex flex-col">
                              {m.teamB.map((id) => (
                                <span
                                  key={id}
                                  className="text-lg font-bold text-white leading-tight"
                                >
                                  {getPlayerName(id)}
                                </span>
                              ))}
                            </div>
                            <div className="text-4xl font-black text-white font-mono bg-slate-950 px-4 py-1 rounded-lg border border-slate-800">
                              {displayB}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <section>
                <h2 className="flex items-center gap-2 text-sm font-black text-white uppercase tracking-wider mb-4">
                  <Calendar className="text-indigo-400" size={18} /> Up Next
                </h2>
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
                  {matches.upcoming.length === 0 ? (
                    <div className="p-6 text-center text-slate-500 text-sm">
                      No scheduled matches.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-800/50">
                      {matches.upcoming.slice(0, 10).map((m) => (
                        <div
                          key={m.id}
                          className="p-4 hover:bg-slate-800/50 transition-colors"
                        >
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-[10px] font-bold text-indigo-400 uppercase bg-indigo-500/10 px-2 py-0.5 rounded">
                              {m.stage}
                            </span>
                            <span className="text-xs font-bold text-slate-400 flex items-center gap-1">
                              {formatTime(m.timeSlot)} • {m.court}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-4 text-sm font-bold text-white">
                            <div className="flex-1 truncate">
                              {m.teamA.map(getPlayerName).join(" & ")}
                            </div>
                            <span className="text-slate-600 text-xs uppercase px-2">
                              VS
                            </span>
                            <div className="flex-1 truncate text-right">
                              {m.teamB.map(getPlayerName).join(" & ")}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <section>
                <h2 className="flex items-center gap-2 text-sm font-black text-white uppercase tracking-wider mb-4">
                  <Trophy className="text-amber-400" size={18} /> Recent Results
                </h2>
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
                  {matches.completed.length === 0 ? (
                    <div className="p-6 text-center text-slate-500 text-sm">
                      No completed matches yet.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-800/50">
                      {matches.completed.slice(0, 10).map((m) => {
                        const teamAWon =
                          m.walkover === "A" || m.scoreA > m.scoreB;
                        const teamBWon =
                          m.walkover === "B" || m.scoreB > m.scoreA;
                        return (
                          <div
                            key={m.id}
                            className="p-4 hover:bg-slate-800/50 transition-colors"
                          >
                            <div className="text-[10px] font-bold text-slate-500 uppercase mb-2">
                              {m.stage}
                            </div>
                            <div className="space-y-1.5">
                              <div
                                className={`flex justify-between items-center text-sm ${teamAWon ? "font-black text-white" : "font-medium text-slate-400"}`}
                              >
                                <div className="truncate flex items-center gap-2">
                                  {teamAWon && (
                                    <ChevronRight
                                      size={14}
                                      className="text-amber-500"
                                    />
                                  )}
                                  {m.teamA.map(getPlayerName).join(" & ")}
                                </div>
                                <div className="font-mono">
                                  {m.walkover
                                    ? m.walkover === "A"
                                      ? "W"
                                      : "L"
                                    : `${m.scoreA}`}
                                </div>
                              </div>
                              <div
                                className={`flex justify-between items-center text-sm ${teamBWon ? "font-black text-white" : "font-medium text-slate-400"}`}
                              >
                                <div className="truncate flex items-center gap-2">
                                  {teamBWon && (
                                    <ChevronRight
                                      size={14}
                                      className="text-amber-500"
                                    />
                                  )}
                                  {m.teamB.map(getPlayerName).join(" & ")}
                                </div>
                                <div className="font-mono">
                                  {m.walkover
                                    ? m.walkover === "B"
                                      ? "W"
                                      : "L"
                                    : `${m.scoreB}`}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        ) : (
          <div className="animate-in fade-in space-y-4">
            <div className="flex justify-between items-center bg-slate-900 border border-slate-800 p-4 rounded-2xl">
              <h2 className="text-sm font-black text-white uppercase tracking-wider hidden md:block">
                Live Rankings
              </h2>
              <select
                value={leaderboardCategory}
                onChange={(e) => setLeaderboardCategory(e.target.value)}
                className="bg-slate-950 border border-slate-700 text-white p-2 rounded-lg text-sm font-bold outline-none focus:border-indigo-500 transition-colors w-full md:w-64 cursor-pointer"
              >
                <option value="all">Global (All Categories)</option>
                {uniqueCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl overflow-x-auto">
              {displayedLeaderboard.length === 0 ? (
                <div className="p-10 text-center text-slate-500 font-medium">
                  Rankings will appear once matches are completed.
                </div>
              ) : (
                <table className="w-full text-left border-collapse min-w-[600px]">
                  <thead>
                    <tr className="bg-slate-950 border-b border-slate-800 text-[10px] uppercase tracking-widest text-slate-500">
                      <th className="p-4 font-black w-16 text-center">Rank</th>
                      <th className="p-4 font-black">Player</th>
                      <th className="p-4 font-black text-center">Played</th>
                      <th className="p-4 font-black text-center text-amber-500">
                        Wins
                      </th>
                      <th className="p-4 font-black text-center">Pt Diff</th>
                      <th className="p-4 font-black text-center">Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {displayedLeaderboard.map((player, idx) => (
                      <tr
                        key={player.id}
                        className="hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="p-4 text-center">
                          <span
                            className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-black text-sm ${idx === 0 ? "bg-yellow-500/20 text-yellow-500 border border-yellow-500/50" : idx === 1 ? "bg-slate-300/20 text-slate-300 border border-slate-300/50" : idx === 2 ? "bg-amber-700/20 text-amber-600 border border-amber-700/50" : "bg-slate-800 text-slate-400"}`}
                          >
                            {idx + 1}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="font-bold text-white text-base">
                            {player.name}
                          </div>
                          <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mt-0.5">
                            {player.category}
                          </div>
                        </td>
                        <td className="p-4 text-center font-mono text-slate-300">
                          {player.matches}
                        </td>
                        <td className="p-4 text-center font-mono font-black text-amber-400">
                          {player.wins}
                        </td>
                        <td className="p-4 text-center font-mono text-slate-300">
                          <span
                            className={
                              player.pointDiff > 0
                                ? "text-emerald-400"
                                : player.pointDiff < 0
                                  ? "text-red-400"
                                  : ""
                            }
                          >
                            {player.pointDiff > 0
                              ? `+${player.pointDiff}`
                              : player.pointDiff}
                          </span>
                        </td>
                        <td className="p-4 text-center font-mono font-black text-indigo-300">
                          {player.rankScore}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </main>

      <div className="fixed bottom-0 left-0 right-0 p-4 text-center border-t border-slate-800 bg-slate-950">
        <Link
          href="/admin/login"
          className="text-[10px] font-bold text-slate-600 hover:text-indigo-400 transition-colors uppercase tracking-widest"
        >
          Organizer & Referee Portal
        </Link>
      </div>
    </div>
  );
}
