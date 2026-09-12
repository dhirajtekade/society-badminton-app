"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, writeBatch } from "firebase/firestore";
import {
  Network,
  Users,
  CheckSquare,
  Square,
  ChevronRight,
  Filter,
  Shuffle,
  ArrowLeft,
  Save,
  Trophy,
  Medal,
  RotateCcw,
  UploadCloud,
  RefreshCw,
} from "lucide-react";
import { useTournament } from "@/components/TournamentSelector";

export default function AdminBracketsPage() {
  const {
    tournaments,
    activeTournament,
    switchTournament,
    isLoading: tLoading,
  } = useTournament();

  // Wizard State: 1 = Draft Pool, 2 = Seeding Preview, 3 = Interactive Bracket Tree
  const [step, setStep] = useState(1);

  // Data State
  const [rankedPlayers, setRankedPlayers] = useState([]);
  const [allMatches, setAllMatches] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Selection State (Step 1)
  const [selectedIds, setSelectedIds] = useState([]);
  const [filterCat, setFilterCat] = useState("all");

  // Seeding State (Step 2)
  const [matchups, setMatchups] = useState([]);
  const [stageName, setStageName] = useState("Pre-Quarter");
  const [matchType, setMatchType] = useState("singles");

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
            category: mData.category || "Uncategorized",
            matchesPlayed: 0,
            totalWins: 0,
            pointsScored: 0,
            pointsConceded: 0,
          };
        });

        const matchesSnap = await getDocs(
          collection(db, "tournaments", activeTournament.id, "matches"),
        );
        const fetchedMatches = [];

        matchesSnap.forEach((doc) => {
          const m = doc.data();
          fetchedMatches.push({ id: doc.id, ...m });
          if (m.status !== "completed") return;

          const teamA = m.teamA || [];
          const teamB = m.teamB || [];
          const scoreA = m.scoreA || 0;
          const scoreB = m.scoreB || 0;
          const walkover = m.walkover;

          let teamAWon = false;
          let teamBWon = false;

          if (walkover === "A") teamAWon = true;
          else if (walkover === "B") teamBWon = true;
          else if (walkover === "both") return;
          else {
            teamAWon = scoreA > scoreB;
            teamBWon = scoreB > scoreA;
          }

          teamA.forEach((id) => {
            if (stats[id]) {
              stats[id].matchesPlayed += 1;
              stats[id].pointsScored += walkover ? 0 : scoreA;
              stats[id].pointsConceded += walkover ? 0 : scoreB;
              if (teamAWon) stats[id].totalWins += 1;
            }
          });

          teamB.forEach((id) => {
            if (stats[id]) {
              stats[id].matchesPlayed += 1;
              stats[id].pointsScored += walkover ? 0 : scoreB;
              stats[id].pointsConceded += walkover ? 0 : scoreA;
              if (teamBWon) stats[id].totalWins += 1;
            }
          });
        });

        const rankedArray = Object.values(stats).map((p) => {
          const pointDifference = p.pointsScored - p.pointsConceded;
          const rankScore =
            p.totalWins * 10000 + pointDifference * 100 + p.pointsScored;
          return { ...p, pointDifference, rankScore };
        });

        rankedArray.sort((a, b) => b.rankScore - a.rankScore);
        setRankedPlayers(rankedArray);
        setAllMatches(fetchedMatches);

        const knockoutMatches = fetchedMatches.filter((m) =>
          [
            "Pre-Quarter",
            "Round of 16",
            "Quarter-Final",
            "Semi-Final",
            "Final",
          ].some((s) => m.stage?.includes(s)),
        );
        if (knockoutMatches.length > 0) {
          setStep(3);
        }
      } catch (error) {
        console.error("Error loading tournament details:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTournamentData();
  }, [activeTournament, refreshTrigger]);

  const uniqueCategories = [...new Set(rankedPlayers.map((p) => p.category))];
  const displayedPlayers =
    filterCat === "all"
      ? rankedPlayers
      : rankedPlayers.filter((p) => p.category === filterCat);

  const togglePlayer = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((pId) => pId !== id) : [...prev, id],
    );
  };

  const selectTopN = (n) => {
    const topNIds = displayedPlayers.slice(0, n).map((p) => p.id);
    setSelectedIds((prev) => [...new Set([...prev, ...topNIds])]);
  };

  const prepareMatchups = () => {
    const drafted = rankedPlayers.filter((p) => selectedIds.includes(p.id));

    let bracketSize = 2;
    while (bracketSize < drafted.length) {
      bracketSize *= 2;
    }

    let baseCode = "PQ";
    if (bracketSize <= 2) {
      setStageName("Championship Final");
      baseCode = "Final";
    } else if (bracketSize <= 4) {
      setStageName("Semi-Finals");
      baseCode = "Semi";
    } else if (bracketSize <= 8) {
      setStageName("Quarter-Finals");
      baseCode = "QF";
    } else if (bracketSize <= 16) {
      setStageName("Pre-Quarter");
      baseCode = "PQ";
    } else {
      setStageName(`Round of ${bracketSize}`);
      baseCode = `R${bracketSize}`;
    }

    let seeds = [1, 2];
    while (seeds.length < bracketSize) {
      const nextSeeds = [];
      const currentSum = seeds.length * 2 + 1;
      for (let seed of seeds) {
        nextSeeds.push(seed);
        nextSeeds.push(currentSum - seed);
      }
      seeds = nextSeeds;
    }

    const initialMatchups = [];
    for (let i = 0; i < seeds.length; i += 2) {
      const seed1 = seeds[i];
      const seed2 = seeds[i + 1];

      const p1Id = seed1 <= drafted.length ? drafted[seed1 - 1].id : "BYE";
      const p2Id = seed2 <= drafted.length ? drafted[seed2 - 1].id : "BYE";

      initialMatchups.push({
        id: `${baseCode}_${i / 2 + 1}`,
        code: baseCode === "Final" ? "Final" : `${baseCode} ${i / 2 + 1}`,
        p1: p1Id,
        p2: p2Id,
        p1Seed: seed1 <= drafted.length ? seed1 : null,
        p2Seed: seed2 <= drafted.length ? seed2 : null,
      });
    }

    setMatchups(initialMatchups);
    setStep(2);
  };

  const updateMatchupPlayer = (matchIndex, playerSlot, newPlayerId) => {
    setMatchups((prev) => {
      const updated = [...prev];
      updated[matchIndex][playerSlot] = newPlayerId;
      return updated;
    });
  };

  const handleGenerateMatches = async () => {
    if (!confirm(`Generate these matches for ${stageName}?`)) return;
    setIsSaving(true);

    try {
      const batch = writeBatch(db);
      const generated = [];

      matchups.forEach((m, idx) => {
        if (!m.p1 || !m.p2 || m.p1 === "BYE" || m.p2 === "BYE") return;

        const matchRef = doc(
          collection(db, "tournaments", activeTournament.id, "matches"),
        );
        const docData = {
          stage: `${stageName} (${m.code})`,
          type: matchType,
          teamA: [m.p1],
          teamB: [m.p2],
          status: "scheduled",
          timeSlot: "TBD",
          court: "TBD",
          scoreA: 0,
          scoreB: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        batch.set(matchRef, docData);
        generated.push({ id: matchRef.id, ...docData });
      });

      if (generated.length > 0) {
        await batch.commit();
        setAllMatches((prev) => [...generated, ...prev]);
      }
      setStep(3);
    } catch (error) {
      console.error("Error generating knockout matches:", error);
      alert("Failed to commit matches to Firestore.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSyncNextRound = async () => {
    setIsSaving(true);
    const batch = writeBatch(db);
    let newMatchesCreated = 0;
    const newMatchesList = [];

    const tryCreateMatch = (
      targetCode,
      targetStage,
      source1Code,
      source2Code,
    ) => {
      if (findMatchByCode(targetCode)) return;

      const m1 = findMatchByCode(source1Code);
      const m2 = findMatchByCode(source2Code);

      const w1 = getWinner(m1);
      const w2 = getWinner(m2);

      if (w1 && w2) {
        const matchRef = doc(
          collection(db, "tournaments", activeTournament.id, "matches"),
        );
        const docData = {
          stage: `${targetStage} (${targetCode})`,
          type: m1.type || "singles",
          teamA: [w1.id],
          teamB: [w2.id],
          status: "scheduled",
          timeSlot: "TBD",
          court: "TBD",
          scoreA: 0,
          scoreB: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        batch.set(matchRef, docData);
        newMatchesCreated++;
        newMatchesList.push({ id: matchRef.id, ...docData });
      }
    };

    for (let i = 1; i <= 4; i++)
      tryCreateMatch(
        `QF ${i}`,
        "Quarter-Final",
        `PQ ${i * 2 - 1}`,
        `PQ ${i * 2}`,
      );
    for (let i = 1; i <= 2; i++)
      tryCreateMatch(
        `Semi ${i}`,
        "Semi-Final",
        `QF ${i * 2 - 1}`,
        `QF ${i * 2}`,
      );
    tryCreateMatch(`Final`, "Championship Final", `Semi 1`, `Semi 2`);

    if (newMatchesCreated > 0) {
      await batch.commit();
      setAllMatches((prev) => [...prev, ...newMatchesList]);
      alert(
        `Successfully pushed ${newMatchesCreated} new match(es) to the Live Scorer!`,
      );
    } else {
      alert(
        "No new matches are ready. Make sure preceding matches are completed in the Scorer.",
      );
    }
    setIsSaving(false);
  };

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

  // --- THE BUG FIX: Wrap the search in parentheses so "Final" doesn't match "Quarter-Final" ---
  const findMatchByCode = (codePrefix) => {
    return allMatches.find((m) => m.stage?.includes(`(${codePrefix})`));
  };

  if (tLoading)
    return (
      <div className="p-10 text-center text-gray-500">
        Loading Bracket Builder...
      </div>
    );

  const draftedPlayersData = rankedPlayers.filter((p) =>
    selectedIds.includes(p.id),
  );

  return (
    <div className="max-w-[1600px] mx-auto p-4 md:p-6 mt-4 pb-24">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 bg-indigo-900 text-white p-4 rounded-xl shadow-md">
        <div className="flex items-center gap-3">
          <Network size={28} className="text-yellow-400" />
          <div>
            <h1 className="text-xl font-black tracking-tight">
              Knockout Stage
            </h1>
            <p className="text-xs font-bold text-indigo-300 uppercase">
              {step === 1
                ? "Step 1: Draft Roster"
                : step === 2
                  ? "Step 2: Seed Pairings"
                  : "Tournament Bracket Tree"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {step === 3 && (
            <button
              onClick={handleSyncNextRound}
              disabled={isSaving}
              className="bg-green-500 hover:bg-green-600 text-green-950 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors shadow-sm disabled:opacity-50"
            >
              <UploadCloud size={16} />{" "}
              {isSaving ? "Syncing..." : "Push Ready Matches"}
            </button>
          )}

          {/* --- THE NEW REFRESH BUTTON --- */}
          {step === 3 && (
            <button 
              onClick={() => setRefreshTrigger(prev => prev + 1)}
              disabled={isLoading}
              className="bg-sky-500 hover:bg-sky-600 text-sky-950 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors shadow-sm disabled:opacity-50"
            >
              <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} /> 
              {isLoading ? "Refreshing..." : "Refresh Data"}
            </button>
          )}

          {step === 3 && (
            <button
              onClick={() => {
                if (
                  confirm(
                    "Are you sure you want to go back to the drafting phase? Your existing bracket will remain in the database until you overwrite it.",
                  )
                ) {
                  setStep(1);
                  setSelectedIds([]);
                }
              }}
              className="bg-indigo-800 hover:bg-indigo-700 text-indigo-200 hover:text-white px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw size={16} /> Re-seed
            </button>
          )}

          <select
            value={activeTournament?.id || ""}
            onChange={(e) => {
              switchTournament(e.target.value);
              setSelectedIds([]);
              setStep(1);
            }}
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
          Loading bracket system...
        </div>
      ) : step === 1 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden animate-in fade-in">
          <div className="bg-gray-50 p-4 border-b border-gray-200 flex flex-col md:flex-row justify-between gap-4">
            <div className="flex items-center gap-2">
              <Filter size={18} className="text-gray-400" />
              <select
                value={filterCat}
                onChange={(e) => setFilterCat(e.target.value)}
                className="border border-gray-300 p-2 rounded-lg text-sm font-bold text-gray-700 outline-none focus:border-indigo-500"
              >
                <option value="all">Overall Leaderboard</option>
                {uniqueCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat} Tag
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-400 uppercase mr-2">
                Quick Select:
              </span>
              <button
                onClick={() => selectTopN(8)}
                className="bg-indigo-100 text-indigo-700 hover:bg-indigo-200 px-3 py-1.5 rounded text-sm font-bold transition-colors"
              >
                Top 8
              </button>
              <button
                onClick={() => selectTopN(16)}
                className="bg-indigo-100 text-indigo-700 hover:bg-indigo-200 px-3 py-1.5 rounded text-sm font-bold transition-colors"
              >
                Top 16
              </button>
              <button
                onClick={() => setSelectedIds([])}
                className="bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 px-3 py-1.5 rounded text-sm font-bold ml-2 transition-colors"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="max-h-[60vh] overflow-y-auto p-2">
            {displayedPlayers.map((p, index) => {
              const isSelected = selectedIds.includes(p.id);
              return (
                <label
                  key={p.id}
                  className={`flex items-center justify-between p-3 mb-2 rounded-lg border-2 cursor-pointer transition-all ${
                    isSelected
                      ? "border-indigo-500 bg-indigo-50"
                      : "border-gray-100 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className="text-indigo-600">
                      {isSelected ? (
                        <CheckSquare size={24} />
                      ) : (
                        <Square size={24} className="text-gray-300" />
                      )}
                    </div>
                    <div>
                      <div className="font-black text-gray-900 text-lg flex items-center gap-2">
                        {index + 1}. {p.name}
                        {isSelected && (
                          <span className="bg-indigo-600 text-white text-[10px] uppercase px-1.5 py-0.5 rounded">
                            Drafted
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-bold text-gray-500 uppercase mt-0.5">
                        {p.category} • {p.matchesPlayed} Matches
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black text-indigo-700">
                      {p.rankScore}
                    </div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase">
                      Rank Score
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={isSelected}
                    onChange={() => togglePlayer(p.id)}
                  />
                </label>
              );
            })}
          </div>
        </div>
      ) : step === 2 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden animate-in fade-in">
          <div className="bg-indigo-50 p-5 border-b border-indigo-100 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-indigo-600 uppercase tracking-wider mb-1">
                Stage Name
              </label>
              <input
                type="text"
                value={stageName}
                onChange={(e) => setStageName(e.target.value)}
                placeholder="e.g. Pre-Quarter"
                className="w-full border border-indigo-200 p-2.5 rounded-lg font-bold text-indigo-900 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-black text-indigo-600 uppercase tracking-wider mb-1">
                Match Type
              </label>
              <select
                value={matchType}
                onChange={(e) => setMatchType(e.target.value)}
                className="w-full border border-indigo-200 p-2.5 rounded-lg font-bold text-indigo-900 outline-none bg-white"
              >
                <option value="singles">Singles</option>
                <option value="doubles">Doubles</option>
              </select>
            </div>
          </div>

          <div className="p-4 md:p-6 space-y-4">
            {matchups.map((match, idx) => (
              <div
                key={match.id}
                className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-col md:flex-row items-center gap-4 relative"
              >
                <div className="absolute -top-3 left-4 bg-gray-800 text-white text-[10px] font-black uppercase px-2 py-1 rounded">
                  {match.code || `Match ${idx + 1}`}
                </div>

                <div className="flex-1 w-full mt-2 md:mt-0">
                  <select
                    value={match.p1}
                    onChange={(e) =>
                      updateMatchupPlayer(idx, "p1", e.target.value)
                    }
                    className="w-full border border-gray-300 p-3 rounded-lg text-sm font-bold text-gray-800 outline-none focus:border-indigo-500 bg-white shadow-sm"
                  >
                    <option value="">-- Select Player --</option>
                    <option value="BYE">BYE (Auto-Advance)</option>
                    {draftedPlayersData.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (Seed{" "}
                        {draftedPlayersData.findIndex((d) => d.id === p.id) + 1}
                        )
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col items-center justify-center shrink-0">
                  <div className="bg-white border border-gray-200 rounded-full p-2 text-gray-400 shadow-sm">
                    <Shuffle size={16} />
                  </div>
                  <span className="text-[10px] font-bold text-gray-400 mt-1 uppercase">
                    VS
                  </span>
                </div>

                <div className="flex-1 w-full">
                  <select
                    value={match.p2}
                    onChange={(e) =>
                      updateMatchupPlayer(idx, "p2", e.target.value)
                    }
                    className="w-full border border-gray-300 p-3 rounded-lg text-sm font-bold text-gray-800 outline-none focus:border-indigo-500 bg-white shadow-sm"
                  >
                    <option value="">-- Select Player --</option>
                    <option value="BYE">BYE (Auto-Advance)</option>
                    {draftedPlayersData.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (Seed{" "}
                        {draftedPlayersData.findIndex((d) => d.id === p.id) + 1}
                        )
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
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
                    className="bg-indigo-50/60 border border-indigo-200 rounded-lg p-3 shadow-sm text-xs font-semibold"
                  >
                    <div className="text-[10px] font-black text-indigo-700 uppercase mb-1 flex justify-between">
                      <span>Semi {num}</span>
                      {isComplete && (
                        <span className="text-green-600">Final</span>
                      )}
                    </div>
                    <div
                      className={`flex justify-between items-center py-1.5 px-2 rounded ${p1Win ? "bg-indigo-200 font-black text-gray-900" : "text-gray-700"}`}
                    >
                      <span className="truncate">{autoP1}</span>
                      <span className="font-mono">{match?.scoreA ?? "-"}</span>
                    </div>
                    <div
                      className={`flex justify-between items-center py-1.5 px-2 rounded mt-1 ${p2Win ? "bg-indigo-200 font-black text-gray-900" : "text-gray-700"}`}
                    >
                      <span className="truncate">{autoP2}</span>
                      <span className="font-mono">{match?.scoreB ?? "-"}</span>
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
                  <div className="bg-amber-50/80 border-2 border-amber-300 rounded-xl p-4 shadow-md text-xs font-semibold">
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
                    <div
                      className={`flex justify-between items-center py-2 px-2.5 rounded ${p1Win ? "bg-amber-200 font-black text-gray-900 text-sm" : "text-gray-800"}`}
                    >
                      <span className="truncate">{autoP1}</span>
                      <span className="font-mono">{match?.scoreA ?? "-"}</span>
                    </div>
                    <div
                      className={`flex justify-between items-center py-2 px-2.5 rounded mt-1.5 ${p2Win ? "bg-amber-200 font-black text-gray-900 text-sm" : "text-gray-800"}`}
                    >
                      <span className="truncate">{autoP2}</span>
                      <span className="font-mono">{match?.scoreB ?? "-"}</span>
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

      {/* --- STICKY FOOTER ACTIONS --- */}
      {(step === 1 || step === 2) && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-50 md:left-64">
          <div className="max-w-5xl mx-auto flex justify-between items-center">
            {step === 1 ? (
              <>
                <div className="flex items-center gap-3">
                  <div className="bg-indigo-100 p-2.5 rounded-lg text-indigo-700">
                    <Users size={24} />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-gray-500">
                      Selected for Knockouts
                    </div>
                    <div className="text-xl font-black text-gray-900">
                      {selectedIds.length} Players
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (selectedIds.length < 2)
                      return alert("Select at least 2 players!");
                    prepareMatchups();
                  }}
                  disabled={selectedIds.length === 0}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white font-black px-6 py-3 rounded-xl shadow-md flex items-center gap-2 transition-colors"
                >
                  Seed Matchups <ChevronRight size={20} />
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setStep(1)}
                  className="text-gray-500 hover:text-gray-800 font-bold px-4 py-2 rounded-lg flex items-center gap-2"
                >
                  <ArrowLeft size={18} /> Back
                </button>
                <button
                  onClick={handleGenerateMatches}
                  disabled={isSaving}
                  className="bg-green-500 hover:bg-green-600 disabled:opacity-50 text-gray-900 font-black px-6 py-3 rounded-xl shadow-md flex items-center gap-2 transition-colors"
                >
                  <Save size={20} />
                  {isSaving ? "Generating..." : "Generate Matches"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
