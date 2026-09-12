"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import {
  Trophy,
  MonitorPlay,
  Minus,
  Plus,
  Save,
  Flag,
  AlertCircle,
  Search,
  Calendar,
  ArrowLeftRight,
  CheckCircle2,
} from "lucide-react";
import { useTournament } from "@/components/TournamentSelector";

export default function AdminScorerPage() {
  const {
    tournaments,
    activeTournament,
    switchTournament,
    isLoading: tLoading,
  } = useTournament();

  const [matches, setMatches] = useState([]);
  const [players, setPlayers] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  const [selectedMatch, setSelectedMatch] = useState(null);

  // Scoring State
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [winningScore, setWinningScore] = useState(15);
  const [isSwapped, setIsSwapped] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // --- NEW: Best of 3 Set Tracking ---
  const [isBestOfThree, setIsBestOfThree] = useState(false);
  const [setsWonA, setSetsWonA] = useState(0);
  const [setsWonB, setSetsWonB] = useState(0);

  // Filter States
  const [filterDate, setFilterDate] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!activeTournament?.id) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const masterSnap = await getDocs(collection(db, "players"));
        const masterDict = {};
        masterSnap.forEach((doc) => (masterDict[doc.id] = doc.data()));

        const playersSnap = await getDocs(
          collection(db, "tournaments", activeTournament.id, "players"),
        );
        const playersDict = {};
        playersSnap.forEach((doc) => {
          const tData = doc.data();
          const mData = masterDict[doc.id] || {};
          playersDict[doc.id] = {
            name: mData.name || tData.name || "Unknown",
            category: mData.category || "Unassigned",
          };
        });
        setPlayers(playersDict);

        const matchesSnap = await getDocs(
          collection(db, "tournaments", activeTournament.id, "matches"),
        );
        const fetchedMatches = [];
        matchesSnap.forEach((doc) => {
          fetchedMatches.push({ id: doc.id, ...doc.data() });
        });

        fetchedMatches.sort((a, b) =>
          (a.timeSlot || "").localeCompare(b.timeSlot || ""),
        );
        setMatches(fetchedMatches);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [activeTournament?.id]);

  const handleSelectMatch = (matchId) => {
    if (!matchId) {
      setSelectedMatch(null);
      return;
    }
    const match = matches.find((m) => m.id === matchId);
    setSelectedMatch(match);

    // Auto-detect Best of 3 for Semis and Finals
    const stage = (match.stage || "").toLowerCase();
    const shouldBeBestOf3 = stage.includes("semi") || stage.includes("final");
    setIsBestOfThree(shouldBeBestOf3);

    setSetsWonA(0);
    setSetsWonB(0);

    // Only load existing scores if it's NOT a best-of-3 (since Best of 3 relies on Sets)
    if (!shouldBeBestOf3) {
      setScoreA(match?.scoreA || 0);
      setScoreB(match?.scoreB || 0);
    } else {
      setScoreA(0);
      setScoreB(0);
    }

    setIsSwapped(false);
  };

  const updateLiveScore = async (newA, newB) => {
    if (!selectedMatch) return;
    setScoreA(newA);
    setScoreB(newB);

    const newStatus = newA > 0 || newB > 0 ? "in_progress" : "scheduled";

    try {
      // If it's a Best of 3, we don't save the raw points to Firebase to avoid confusing the bracket logic.
      // We only update status to show it is live.
      const payload = isBestOfThree
        ? { status: newStatus, updatedAt: new Date().toISOString() }
        : {
            scoreA: newA,
            scoreB: newB,
            status: newStatus,
            updatedAt: new Date().toISOString(),
          };

      await updateDoc(
        doc(
          db,
          "tournaments",
          activeTournament.id,
          "matches",
          selectedMatch.id,
        ),
        payload,
      );

      setMatches((prev) =>
        prev.map((m) => (m.id === selectedMatch.id ? { ...m, ...payload } : m)),
      );
    } catch (error) {
      console.error("Failed to sync score:", error);
    }
  };

  // --- NEW: Handle finishing a single set ---
  const handleFinishSet = () => {
    if (scoreA > scoreB) setSetsWonA((prev) => prev + 1);
    else if (scoreB > scoreA) setSetsWonB((prev) => prev + 1);
    else return alert("Tie scores cannot end a set.");

    // Reset points for the next set
    setScoreA(0);
    setScoreB(0);
  };

  const handleEndMatch = async () => {
    setIsSaving(true);

    try {
      // If Best of 3, the final score saved to DB represents SETS WON, not points.
      const finalScoreA = isBestOfThree ? setsWonA : scoreA;
      const finalScoreB = isBestOfThree ? setsWonB : scoreB;

      await updateDoc(
        doc(
          db,
          "tournaments",
          activeTournament.id,
          "matches",
          selectedMatch.id,
        ),
        {
          scoreA: finalScoreA,
          scoreB: finalScoreB,
          status: "completed",
          completedAt: new Date().toISOString(),
        },
      );

      setMatches((prev) =>
        prev.map((m) =>
          m.id === selectedMatch.id
            ? {
                ...m,
                scoreA: finalScoreA,
                scoreB: finalScoreB,
                status: "completed",
              }
            : m,
        ),
      );
      setSelectedMatch(null);
    } catch (error) {
      console.error("Error finishing match:", error);
      alert("Failed to save completed match.");
    } finally {
      setIsSaving(false);
    }
  };

  const getPlayerDisplay = (id) => players[id]?.name || id || "TBD";

  const pendingMatches = matches.filter((m) => {
    const status = (m.status || "").toLowerCase().trim();
    const stage = (m.stage || "").toLowerCase().trim();

    if (status === "completed" || status === "done" || status === "finished")
      return false;
    if (stage.includes("import") || stage.includes("historical")) return false;

    const hasWinningScore = m.scoreA >= 15 || m.scoreB >= 15;
    if (hasWinningScore && status !== "in_progress") return false;

    return true;
  });

  const uniqueDates = [
    ...new Set(
      pendingMatches.map((m) =>
        m.timeSlot ? m.timeSlot.split("|")[0].trim() : "TBD",
      ),
    ),
  ].filter((d) => d !== "TBD");

  const filteredMatches = pendingMatches.filter((m) => {
    const matchDate = m.timeSlot ? m.timeSlot.split("|")[0].trim() : "TBD";
    const passesDate = filterDate === "all" || matchDate === filterDate;

    const p1Names = m.teamA
      .map((id) => getPlayerDisplay(id).toLowerCase())
      .join(" ");
    const p2Names = m.teamB
      .map((id) => getPlayerDisplay(id).toLowerCase())
      .join(" ");
    const searchLower = searchQuery.toLowerCase();
    const passesSearch =
      p1Names.includes(searchLower) || p2Names.includes(searchLower);

    return passesDate && passesSearch;
  });

  const renderTeamPanel = (teamType, isLeft) => {
    const isTeamA = teamType === "A";
    const teamIds = isTeamA ? selectedMatch.teamA : selectedMatch.teamB;
    const score = isTeamA ? scoreA : scoreB;
    const setsWon = isTeamA ? setsWonA : setsWonB;

    const bgClass = isTeamA ? "bg-blue-50/30" : "bg-red-50/30";
    const textClass = isTeamA ? "text-blue-900" : "text-red-900";
    const scoreClass = isTeamA ? "text-blue-600" : "text-red-600";
    const btnClass = isTeamA
      ? "bg-blue-600 hover:bg-blue-700"
      : "bg-red-600 hover:bg-red-700";

    const decreaseScore = () =>
      isTeamA
        ? updateLiveScore(Math.max(0, scoreA - 1), scoreB)
        : updateLiveScore(scoreA, Math.max(0, scoreB - 1));
    const increaseScore = () =>
      isTeamA
        ? updateLiveScore(scoreA + 1, scoreB)
        : updateLiveScore(scoreA, scoreB + 1);

    const minusBtn = (
      <button
        key="minus"
        onClick={decreaseScore}
        className="flex-1 bg-white border-2 border-gray-200 hover:bg-gray-50 text-gray-600 p-3 md:p-4 rounded-xl flex justify-center active:scale-95 transition-transform"
      >
        <Minus size={24} />
      </button>
    );

    const plusBtn = (
      <button
        key="plus"
        onClick={increaseScore}
        className={`flex-[2] text-white p-3 md:p-4 rounded-xl shadow-md flex justify-center active:scale-95 transition-transform ${btnClass}`}
      >
        <Plus size={28} />
      </button>
    );

    return (
      <div
        className={`p-4 md:p-6 flex flex-col items-center flex-1 ${bgClass} relative`}
      >
        {/* SET TRACKER PILL */}
        {isBestOfThree && (
          <div className="absolute top-4 right-4 bg-gray-900 text-white text-[10px] font-black uppercase px-2 py-1 rounded flex items-center gap-1">
            <Trophy
              size={10}
              className={setsWon > 0 ? "text-yellow-400" : "text-gray-500"}
            />
            Sets: {setsWon}
          </div>
        )}

        <h2
          className={`text-center font-bold mb-6 h-12 flex items-center justify-center text-sm md:text-base pr-12 pl-12 ${textClass}`}
        >
          {teamIds.map((id) => getPlayerDisplay(id)).join(" & ")}
        </h2>
        <div
          className={`text-7xl md:text-8xl font-black tracking-tighter mb-8 ${scoreClass}`}
        >
          {score}
        </div>
        <div className="flex w-full gap-2 md:gap-3">
          {isLeft ? [minusBtn, plusBtn] : [plusBtn, minusBtn]}
        </div>
      </div>
    );
  };

  if (tLoading)
    return (
      <div className="p-10 text-center text-gray-500">Loading scorer...</div>
    );

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 mt-6 pb-24">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 bg-indigo-900 text-white p-4 rounded-xl shadow-md">
        <div className="flex items-center gap-3">
          <MonitorPlay size={28} className="text-yellow-400" />
          <div>
            <h1 className="text-xl font-black tracking-tight">Live Scorer</h1>
            <p className="text-xs font-bold text-indigo-300 uppercase">
              Referee Dashboard
            </p>
          </div>
        </div>
        <select
          value={activeTournament?.id || ""}
          onChange={(e) => {
            switchTournament(e.target.value);
            setSelectedMatch(null);
            setFilterDate("all");
            setSearchQuery("");
          }}
          className="bg-indigo-800 text-white border border-indigo-700 p-2 rounded-lg text-sm font-bold outline-none cursor-pointer w-full md:w-auto"
        >
          {tournaments.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="text-center p-12 text-gray-500">Loading matches...</div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
            <div className="flex flex-col md:flex-row gap-4 mb-4">
              <div className="flex-1 relative">
                <Search
                  size={16}
                  className="absolute left-3 top-3 text-gray-400"
                />
                <input
                  type="text"
                  placeholder="Search player name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 transition-colors bg-gray-50 focus:bg-white"
                />
              </div>
              <div className="flex-1 relative">
                <Calendar
                  size={16}
                  className="absolute left-3 top-3 text-gray-400"
                />
                <select
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 transition-colors bg-gray-50 focus:bg-white cursor-pointer"
                >
                  <option value="all">All Upcoming Dates</option>
                  {uniqueDates.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Select Active Match
            </label>
            <select
              value={selectedMatch?.id || ""}
              onChange={(e) => handleSelectMatch(e.target.value)}
              className="w-full border-2 border-gray-200 p-3 rounded-lg text-sm font-semibold outline-none focus:border-indigo-500 transition-colors bg-white cursor-pointer"
            >
              <option value="">-- Choose a match to score --</option>
              {filteredMatches.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.timeSlot} |{" "}
                  {m.teamA.map((id) => getPlayerDisplay(id)).join(" & ")} VS{" "}
                  {m.teamB.map((id) => getPlayerDisplay(id)).join(" & ")}
                </option>
              ))}
            </select>
          </div>

          {selectedMatch && (
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="bg-gray-50 border-b border-gray-200 p-4 flex justify-between items-center flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <span className="bg-indigo-100 text-indigo-800 text-xs font-bold px-2 py-1 rounded uppercase tracking-wider">
                    {selectedMatch.stage}
                  </span>
                  {isBestOfThree && (
                    <span className="bg-purple-100 text-purple-800 text-[10px] font-black px-2 py-1 rounded border border-purple-200 uppercase tracking-wider">
                      Best of 3 Sets
                    </span>
                  )}
                </div>

                <button
                  onClick={() => setIsSwapped(!isSwapped)}
                  className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm hover:bg-gray-100 active:scale-95 transition-all"
                >
                  <ArrowLeftRight size={14} /> Swap Sides
                </button>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-500 uppercase">
                    Game Pt:
                  </span>
                  <select
                    value={winningScore}
                    onChange={(e) => setWinningScore(Number(e.target.value))}
                    className="border border-gray-300 p-1 rounded-md text-xs font-bold cursor-pointer outline-none focus:border-indigo-500"
                  >
                    <option value={15}>15</option>
                    <option value={21}>21</option>
                    <option value={30}>30</option>
                  </select>
                </div>
              </div>

              <div className="flex divide-x divide-gray-200">
                {isSwapped
                  ? renderTeamPanel("B", true)
                  : renderTeamPanel("A", true)}
                {isSwapped
                  ? renderTeamPanel("A", false)
                  : renderTeamPanel("B", false)}
              </div>

              {(scoreA >= winningScore - 1 || scoreB >= winningScore - 1) && (
                <div className="bg-yellow-50 text-yellow-800 p-3 text-center text-sm font-bold flex items-center justify-center gap-2 border-t border-yellow-200 animate-pulse">
                  <AlertCircle size={18} />{" "}
                  {isBestOfThree ? "Set Point!" : "Match Point!"}
                </div>
              )}

              <div className="bg-indigo-50 border-t border-indigo-100 p-3 text-center text-xs md:text-sm font-bold text-indigo-900 flex flex-col md:flex-row items-center justify-center gap-2">
                <span className="bg-indigo-600 text-white text-[10px] uppercase px-2 py-0.5 rounded tracking-wider">
                  Server Note
                </span>
                <span>
                  {(() => {
                    const totalPoints = scoreA + scoreB;
                    const servingTeamIsA = totalPoints % 2 === 0;
                    const servingTeamScore = servingTeamIsA ? scoreA : scoreB;
                    const serviceSide =
                      servingTeamScore % 2 === 0
                        ? "RIGHT (Even) Side ➔"
                        : "← LEFT (Odd) Side";

                    const teamNames = servingTeamIsA
                      ? selectedMatch.teamA
                          .map((id) => getPlayerDisplay(id))
                          .join(" & ")
                      : selectedMatch.teamB
                          .map((id) => getPlayerDisplay(id))
                          .join(" & ");

                    return `Serving Team: ${teamNames} | Serve from the ${serviceSide}`;
                  })()}
                </span>
              </div>

              <div className="bg-gray-800 p-4 flex justify-between items-center flex-wrap gap-4">
                <div className="text-gray-400 text-xs font-bold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                  Live Sync Active
                </div>

                <div className="flex gap-2 w-full md:w-auto">
                  {isBestOfThree && (
                    <button
                      onClick={handleFinishSet}
                      className="bg-purple-500 hover:bg-purple-600 text-white font-black px-4 py-2.5 rounded-lg flex-1 md:flex-none flex items-center justify-center gap-2 transition-colors text-sm"
                    >
                      <CheckCircle2 size={18} /> Next Set
                    </button>
                  )}
                  <button
                    onClick={handleEndMatch}
                    disabled={
                      isSaving ||
                      (isBestOfThree && setsWonA < 2 && setsWonB < 2)
                    }
                    className="bg-green-500 hover:bg-green-600 text-gray-900 font-black px-6 py-2.5 rounded-lg flex-1 md:flex-none flex items-center justify-center gap-2 transition-colors disabled:opacity-50 text-sm"
                  >
                    <Flag size={18} />
                    {isSaving ? "Saving..." : "Finalize Match"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
