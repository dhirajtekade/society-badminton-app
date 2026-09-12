"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import { Network, Trophy, Medal, RefreshCw } from "lucide-react";
import { useTournament } from "@/components/TournamentSelector";

export default function PublicBracketsPage() {
  const {
    tournaments,
    activeTournament,
    switchTournament,
    isLoading: tLoading,
  } = useTournament();

  // Data State
  const [rankedPlayers, setRankedPlayers] = useState([]);
  const [allMatches, setAllMatches] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    if (!activeTournament) return;

    const fetchTournamentData = async () => {
      setIsLoading(true);
      try {
        const masterSnap = await getDocs(collection(db, "players"));
        const masterDict = {};
        masterSnap.forEach((doc) => (masterDict[doc.id] = doc.data()));

        const playersSnap = await getDocs(
          collection(db, "tournaments", activeTournament.id, "players"),
        );
        const stats = {};

        playersSnap.forEach((doc) => {
          const playerId = doc.id;
          const tData = doc.data();
          const mData = masterDict[playerId] || {};

          stats[playerId] = {
            id: playerId,
            name: mData.name || tData.name || "Unknown",
          };
        });

        const matchesSnap = await getDocs(
          collection(db, "tournaments", activeTournament.id, "matches"),
        );
        const fetchedMatches = [];

        matchesSnap.forEach((doc) => {
          fetchedMatches.push({ id: doc.id, ...doc.data() });
        });

        setRankedPlayers(Object.values(stats));
        setAllMatches(fetchedMatches);
      } catch (error) {
        console.error("Error loading tournament details:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTournamentData();
  }, [activeTournament, refreshTrigger]);

  const getPlayerName = (id) => {
    if (!id || id === "BYE") return id || "TBD";
    return rankedPlayers.find((p) => p.id === id)?.name || id;
  };

  const getWinner = (match) => {
    if (!match || match.status !== "completed") return null;
    if (match.walkover === "A")
      return { id: match.teamA[0], name: getPlayerName(match.teamA[0]) };
    if (match.walkover === "B")
      return { id: match.teamB[0], name: getPlayerName(match.teamB[0]) };
    if (match.scoreA > match.scoreB)
      return { id: match.teamA[0], name: getPlayerName(match.teamA[0]) };
    if (match.scoreB > match.scoreA)
      return { id: match.teamB[0], name: getPlayerName(match.teamB[0]) };
    return null;
  };

  const findMatchByCode = (codePrefix) => {
    return allMatches.find((m) => m.stage?.includes(`(${codePrefix})`));
  };

  if (tLoading)
    return (
      <div className="p-10 text-center text-gray-500">
        Loading Bracket Viewer...
      </div>
    );

  return (
    <div className="max-w-[1600px] mx-auto p-4 md:p-6 mt-4 pb-24">
      {/* --- PUBLIC HEADER BANNER --- */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 bg-indigo-900 text-white p-4 rounded-xl shadow-md">
        <div className="flex items-center gap-3">
          <Network size={28} className="text-yellow-400" />
          <div>
            <h1 className="text-xl font-black tracking-tight">
              Live Knockout Stage
            </h1>
            <p className="text-xs font-bold text-indigo-300 uppercase">
              Tournament Bracket Tree
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setRefreshTrigger((prev) => prev + 1)}
            disabled={isLoading}
            className="bg-sky-500 hover:bg-sky-600 text-sky-950 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors shadow-sm disabled:opacity-50"
          >
            <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
            {isLoading ? "Refreshing..." : "Refresh Data"}
          </button>

          <select
            value={activeTournament?.id || ""}
            onChange={(e) => switchTournament(e.target.value)}
            className="bg-indigo-800 text-white border border-indigo-700 p-2 rounded-lg text-sm font-bold outline-none cursor-pointer"
          >
            {tournaments.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-gray-500">
          Loading live bracket data...
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto p-6">
          <div className="min-w-[1200px] grid grid-cols-5 gap-6 items-center">
            {/* COLUMN 1: PRE-QUARTER (ROUND OF 16) */}
            <div className="space-y-4">
              <div className="bg-sky-100 text-sky-900 border border-sky-200 font-black text-xs uppercase p-2.5 rounded-lg text-center">
                Pre-Quarter (R16)
              </div>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((num) => {
                const match =
                  findMatchByCode(`PQ ${num}`) || findMatchByCode(`PQ_${num}`);
                const isComplete = match?.status === "completed";
                const p1Win =
                  isComplete &&
                  (match.walkover === "A" || match.scoreA > match.scoreB);
                const p2Win =
                  isComplete &&
                  (match.walkover === "B" || match.scoreB > match.scoreA);

                return (
                  <div
                    key={num}
                    className="bg-sky-50/60 border border-sky-200 rounded-lg p-2.5 shadow-sm text-xs font-semibold h-[76px] flex flex-col justify-center"
                  >
                    <div className="text-[10px] font-black text-sky-700 uppercase mb-1 flex justify-between">
                      <span>PQ {num}</span>
                      {isComplete && (
                        <span className="text-green-600">Final</span>
                      )}
                    </div>
                    <div
                      className={`flex justify-between items-center py-1 px-1.5 rounded ${p1Win ? "bg-sky-200/80 font-black text-gray-900" : "text-gray-700"}`}
                    >
                      <span className="truncate">
                        {match?.teamA ? getPlayerName(match.teamA[0]) : "TBD"}
                      </span>
                      <span className="font-mono">{match?.scoreA ?? "-"}</span>
                    </div>
                    <div
                      className={`flex justify-between items-center py-1 px-1.5 rounded mt-0.5 ${p2Win ? "bg-sky-200/80 font-black text-gray-900" : "text-gray-700"}`}
                    >
                      <span className="truncate">
                        {match?.teamB ? getPlayerName(match.teamB[0]) : "TBD"}
                      </span>
                      <span className="font-mono">{match?.scoreB ?? "-"}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* COLUMN 2: QUARTER-FINALS */}
            <div className="space-y-12">
              <div className="bg-pink-100 text-pink-900 border border-pink-200 font-black text-xs uppercase p-2.5 rounded-lg text-center">
                Quarter Final
              </div>
              {[1, 2, 3, 4].map((num) => {
                const match =
                  findMatchByCode(`QF ${num}`) || findMatchByCode(`QF_${num}`);
                const isComplete = match?.status === "completed";
                const p1Win =
                  isComplete &&
                  (match.walkover === "A" || match.scoreA > match.scoreB);
                const p2Win =
                  isComplete &&
                  (match.walkover === "B" || match.scoreB > match.scoreA);

                const pqTop = findMatchByCode(`PQ ${num * 2 - 1}`);
                const pqBottom = findMatchByCode(`PQ ${num * 2}`);
                const autoP1 = match?.teamA
                  ? getPlayerName(match.teamA[0])
                  : getWinner(pqTop)?.name || `Winner PQ ${num * 2 - 1}`;
                const autoP2 = match?.teamB
                  ? getPlayerName(match.teamB[0])
                  : getWinner(pqBottom)?.name || `Winner PQ ${num * 2}`;

                return (
                  <div
                    key={num}
                    className="bg-pink-50/60 border border-pink-200 rounded-lg p-3 shadow-sm text-xs font-semibold h-[92px] flex flex-col justify-center"
                  >
                    <div className="text-[10px] font-black text-pink-700 uppercase mb-1 flex justify-between">
                      <span>QF {num}</span>
                      {isComplete && (
                        <span className="text-green-600">Final</span>
                      )}
                    </div>
                    <div
                      className={`flex justify-between items-center py-1 px-1.5 rounded ${p1Win ? "bg-pink-200 font-black text-gray-900" : "text-gray-700"}`}
                    >
                      <span className="truncate">{autoP1}</span>
                      <span className="font-mono">{match?.scoreA ?? "-"}</span>
                    </div>
                    <div
                      className={`flex justify-between items-center py-1 px-1.5 rounded mt-0.5 ${p2Win ? "bg-pink-200 font-black text-gray-900" : "text-gray-700"}`}
                    >
                      <span className="truncate">{autoP2}</span>
                      <span className="font-mono">{match?.scoreB ?? "-"}</span>
                    </div>
                  </div>
                );
              })}
            </div>

           {/* COLUMN 3: SEMI-FINALS */}
            <div className="space-y-36">
              <div className="bg-indigo-100 text-indigo-900 border border-indigo-200 font-black text-xs uppercase p-2.5 rounded-lg text-center">
                Semi Final
              </div>
              {[1, 2].map((num) => {
                const match =
                  findMatchByCode(`Semi ${num}`) ||
                  findMatchByCode(`SF ${num}`);
                const isComplete = match?.status === "completed";
                const p1Win =
                  isComplete &&
                  (match.walkover === "A" || match.scoreA > match.scoreB);
                const p2Win =
                  isComplete &&
                  (match.walkover === "B" || match.scoreB > match.scoreA);

                const qfTop = findMatchByCode(`QF ${num * 2 - 1}`);
                const qfBottom = findMatchByCode(`QF ${num * 2}`);
                const autoP1 = match?.teamA
                  ? getPlayerName(match.teamA[0])
                  : getWinner(qfTop)?.name || `Winner QF ${num * 2 - 1}`;
                const autoP2 = match?.teamB
                  ? getPlayerName(match.teamB[0])
                  : getWinner(qfBottom)?.name || `Winner QF ${num * 2}`;

                return (
                  <div
                    key={num}
                    className="bg-indigo-50/60 border border-indigo-200 rounded-lg p-3 shadow-sm text-xs font-semibold min-w-[200px]"
                  >
                    <div className="text-[10px] font-black text-indigo-700 uppercase mb-1 flex justify-between">
                      <span>Semi {num}</span>
                      {isComplete && (
                        <span className="text-green-600">Final</span>
                      )}
                    </div>
                    
                    {/* Team A */}
                    <div
                      className={`flex justify-between items-center py-1.5 px-2 rounded ${p1Win ? "bg-indigo-200 font-black text-gray-900" : "text-gray-700"}`}
                    >
                      <span className="truncate pr-2">{autoP1}</span>
                      {match?.sets && match.sets.length > 0 ? (
                        <div className="flex gap-1.5 font-mono text-[10px]">
                          {match.sets.map(s => <span key={s.set} className="bg-white/60 px-1 rounded">{s.scoreA}</span>)}
                        </div>
                      ) : (
                        <span className="font-mono">{match?.scoreA ?? "-"}</span>
                      )}
                    </div>

                    {/* Team B */}
                    <div
                      className={`flex justify-between items-center py-1.5 px-2 rounded mt-1 ${p2Win ? "bg-indigo-200 font-black text-gray-900" : "text-gray-700"}`}
                    >
                      <span className="truncate pr-2">{autoP2}</span>
                      {match?.sets && match.sets.length > 0 ? (
                        <div className="flex gap-1.5 font-mono text-[10px]">
                          {match.sets.map(s => <span key={s.set} className="bg-white/60 px-1 rounded">{s.scoreB}</span>)}
                        </div>
                      ) : (
                        <span className="font-mono">{match?.scoreB ?? "-"}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* COLUMN 4: GRAND FINAL */}
            <div>
              <div className="bg-amber-100 text-amber-900 border border-amber-200 font-black text-xs uppercase p-2.5 rounded-lg text-center mb-6">
                Championship Final
              </div>
              {(() => {
                const match = findMatchByCode("Final");
                const isComplete = match?.status === "completed";
                const p1Win =
                  isComplete &&
                  (match.walkover === "A" || match.scoreA > match.scoreB);
                const p2Win =
                  isComplete &&
                  (match.walkover === "B" || match.scoreB > match.scoreA);

                const sf1 =
                  findMatchByCode("Semi 1") || findMatchByCode("SF 1");
                const sf2 =
                  findMatchByCode("Semi 2") || findMatchByCode("SF 2");
                const autoP1 = match?.teamA
                  ? getPlayerName(match.teamA[0])
                  : getWinner(sf1)?.name || "Winner Semi 1";
                const autoP2 = match?.teamB
                  ? getPlayerName(match.teamB[0])
                  : getWinner(sf2)?.name || "Winner Semi 2";

                return (
                  <div className="bg-amber-50/80 border-2 border-amber-300 rounded-xl p-4 shadow-md text-xs font-semibold min-w-[220px]">
                    <div className="text-xs font-black text-amber-800 uppercase mb-2 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Trophy size={16} className="text-amber-600" /> FINAL
                      </span>
                      {isComplete && (
                        <span className="bg-green-600 text-white text-[10px] px-2 py-0.5 rounded">
                          Winner Decided
                        </span>
                      )}
                    </div>
                    
                    {/* Team A */}
                    <div
                      className={`flex justify-between items-center py-2 px-2.5 rounded ${p1Win ? "bg-amber-200 font-black text-gray-900 text-sm" : "text-gray-800"}`}
                    >
                      <span className="truncate pr-2">{autoP1}</span>
                      {match?.sets && match.sets.length > 0 ? (
                        <div className="flex gap-1.5 font-mono text-[10px]">
                          {match.sets.map(s => <span key={s.set} className="bg-white/60 px-1 rounded">{s.scoreA}</span>)}
                        </div>
                      ) : (
                        <span className="font-mono">{match?.scoreA ?? "-"}</span>
                      )}
                    </div>

                    {/* Team B */}
                    <div
                      className={`flex justify-between items-center py-2 px-2.5 rounded mt-1.5 ${p2Win ? "bg-amber-200 font-black text-gray-900 text-sm" : "text-gray-800"}`}
                    >
                      <span className="truncate pr-2">{autoP2}</span>
                      {match?.sets && match.sets.length > 0 ? (
                        <div className="flex gap-1.5 font-mono text-[10px]">
                          {match.sets.map(s => <span key={s.set} className="bg-white/60 px-1 rounded">{s.scoreB}</span>)}
                        </div>
                      ) : (
                        <span className="font-mono">{match?.scoreB ?? "-"}</span>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* COLUMN 5: CHAMPION PODIUM */}
            <div className="flex flex-col items-center justify-center p-6 bg-gradient-to-b from-yellow-50 to-amber-100/60 border-2 border-yellow-300 rounded-2xl text-center shadow-md">
              <div className="bg-yellow-400 text-gray-900 p-4 rounded-full shadow-lg mb-3">
                <Trophy size={36} />
              </div>
              <span className="text-xs font-black text-amber-800 uppercase tracking-widest mb-1">
                Tournament Champion
              </span>
              {(() => {
                const finalMatch = findMatchByCode("Final");
                const champ = getWinner(finalMatch);
                return (
                  <div className="text-lg font-black text-gray-900 mt-1">
                    {champ ? (
                      <span className="text-indigo-950 flex items-center gap-1.5 justify-center">
                        <Medal size={20} className="text-amber-500" />{" "}
                        {champ.name}
                      </span>
                    ) : (
                      <span className="text-gray-400 italic text-sm">
                        Undetermined
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
