"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  doc,
  setDoc,
  addDoc,
  writeBatch,
  getDoc,
} from "firebase/firestore";
import {
  Plus,
  Edit2,
  Clock,
  MapPin,
  Zap,
  AlertTriangle,
  Settings2,
  X,
  Trash2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

export default function AdminMatchesPage() {
  const [matches, setMatches] = useState([]);
  const [playersList, setPlayersList] = useState([]);
  const [players, setPlayers] = useState({});
  const [tournamentDays, setTournamentDays] = useState([]);
  const [playerCategories, setPlayerCategories] = useState([]);
  const [matchDuration, setMatchDuration] = useState(10);
  const [bufferTime, setBufferTime] = useState(5);
  const [isLoading, setIsLoading] = useState(true);

  // --- FILTER & SORT STATES ---
  const [filterDate, setFilterDate] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [sortBy, setSortBy] = useState("time"); // "time" | "player"
  const [sortDir, setSortDir] = useState("asc"); // "asc" (Up) | "desc" (Down)

  // Modals State
  const [isMatchModalOpen, setIsMatchModalOpen] = useState(false);
  const [isGenModalOpen, setIsGenModalOpen] = useState(false);
  const [editingMatchId, setEditingMatchId] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const [formData, setFormData] = useState({
    type: "singles",
    stage: "League",
    teamA: [""],
    teamB: [""],
    court: "Court 1",
    timeSlot: "",
    status: "scheduled",
  });

  const [genData, setGenData] = useState({
    type: "singles",
    maxMatchesPerPlayer: 2,
    courtCount: 1,
    priority1: "cat_same",
    priority2: "avail_strict",
    priority3: "none",
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const settingsSnap = await getDoc(doc(db, "settings", "tournament"));
        if (settingsSnap.exists()) {
          const data = settingsSnap.data();
          if (data.tournamentDays) setTournamentDays(data.tournamentDays);
          if (data.playerCategories) setPlayerCategories(data.playerCategories);
          if (data.matchDuration) setMatchDuration(data.matchDuration);
          if (data.bufferTime) setBufferTime(data.bufferTime);
        }

        const playersSnap = await getDocs(collection(db, "players"));
        const playersDict = {};
        const pList = [];
        playersSnap.forEach((doc) => {
          playersDict[doc.id] = doc.data().name;
          pList.push({ id: doc.id, ...doc.data() });
        });
        setPlayers(playersDict);
        setPlayersList(pList);

        const matchesSnap = await getDocs(collection(db, "matches"));
        const fetchedMatches = [];
        matchesSnap.forEach((doc) => {
          fetchedMatches.push({ id: doc.id, ...doc.data() });
        });
        setMatches(fetchedMatches);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const formatDisplayDate = (dateString) => {
    const options = { weekday: "short", month: "short", day: "numeric" };
    return new Date(dateString).toLocaleDateString("en-IN", options);
  };

  const formatTime12h = (hours, minutes) => {
    const h = parseInt(hours, 10);
    const m = parseInt(minutes, 10);
    const suffix = h >= 12 ? "PM" : "AM";
    const displayHours = h % 12 || 12;
    const displayMins = m < 10 ? `0${m}` : m;
    return `${displayHours}:${displayMins} ${suffix}`;
  };

  const handleClearAllMatches = async () => {
    if (
      !confirm("⚠️ Are you sure you want to delete ALL current match fixtures?")
    )
      return;
    setIsClearing(true);

    try {
      const matchesSnap = await getDocs(collection(db, "matches"));
      const batch = writeBatch(db);
      matchesSnap.forEach((matchDoc) =>
        batch.delete(doc(db, "matches", matchDoc.id)),
      );
      await batch.commit();
      setMatches([]);
      alert("All previous match fixtures deleted successfully.");
    } catch (error) {
      console.error("Error clearing matches:", error);
    } finally {
      setIsClearing(false);
    }
  };

  const executeSmartGeneration = async (e) => {
    e.preventDefault();
    setIsGenerating(true);

    try {
      const batch = writeBatch(db);
      const generatedMatches = [];
      const maxLimit = parseInt(genData.maxMatchesPerPlayer, 10) || 2;
      const maxCourts = parseInt(genData.courtCount, 10) || 1;
      const totalSlotTime =
        (parseInt(matchDuration, 10) || 10) + (parseInt(bufferTime, 10) || 5);

      const allPriorities = [
        genData.priority1,
        genData.priority2,
        genData.priority3,
      ];
      const rules = {
        sameCategory: allPriorities.includes("cat_same"),
        crossCategory: allPriorities.includes("cat_cross"),
        checkAvail:
          allPriorities.includes("avail_strict") ||
          allPriorities.includes("avail_loose"),
        strictAvail: allPriorities.includes("avail_strict"),
      };

      const activePlayers = playersList.filter((p) =>
        genData.type === "singles" ? p.playsSingles : p.playsDoubles,
      );
      const pairs = [];
      const matchCounts = {};

      activePlayers.forEach((p) => (matchCounts[p.id] = 0));

      const tryAddPair = (p1, p2, stageName) => {
        if (matchCounts[p1.id] < maxLimit && matchCounts[p2.id] < maxLimit) {
          const exists = pairs.some(
            (m) =>
              (m.p1.id === p1.id && m.p2.id === p2.id) ||
              (m.p1.id === p2.id && m.p2.id === p1.id),
          );
          if (!exists) {
            pairs.push({ p1, p2, stage: stageName });
            matchCounts[p1.id]++;
            matchCounts[p2.id]++;
            return true;
          }
        }
        return false;
      };

      if (rules.sameCategory) {
        playerCategories.forEach((cat) => {
          const catPlayers = activePlayers.filter(
            (p) => p.category === cat.name,
          );
          for (let i = 0; i < catPlayers.length; i++) {
            for (let offset = 1; offset < catPlayers.length; offset++) {
              const j = (i + offset) % catPlayers.length;
              if (i !== j)
                tryAddPair(catPlayers[i], catPlayers[j], `League: ${cat.name}`);
            }
          }
        });
      } else {
        for (let i = 0; i < activePlayers.length; i++) {
          for (let offset = 1; offset < activePlayers.length; offset++) {
            const j = (i + offset) % activePlayers.length;
            if (i !== j)
              tryAddPair(activePlayers[i], activePlayers[j], "General League");
          }
        }
      }

      const slotTracker = {};
      const allParentBlockIds = [];

      tournamentDays.forEach((day) => {
        day.slots.forEach((block) => {
          if (!allParentBlockIds.includes(block.id)) {
            allParentBlockIds.push(block.id);
          }

          const [startH, startM] = block.startTime.split(":").map(Number);
          const [endH, endM] = block.endTime.split(":").map(Number);

          let currentTotalMins = startH * 60 + startM;
          const endTotalMins = endH * 60 + endM;

          while (
            currentTotalMins + (parseInt(matchDuration, 10) || 10) <=
            endTotalMins
          ) {
            const mStartH = Math.floor(currentTotalMins / 60);
            const mStartM = currentTotalMins % 60;

            const matchEndMins =
              currentTotalMins + (parseInt(matchDuration, 10) || 10);
            const mEndH = Math.floor(matchEndMins / 60);
            const mEndM = matchEndMins % 60;

            const timeLabel = `${formatTime12h(mStartH, mStartM)} - ${formatTime12h(mEndH, mEndM)}`;
            const uniqueKey = `${day.date}_${mStartH}:${mStartM}`;

            const courtsObj = {};
            for (let c = 1; c <= maxCourts; c++) {
              courtsObj[`Court ${c}`] = false;
            }

            slotTracker[uniqueKey] = {
              date: day.date,
              label: `${formatDisplayDate(day.date)} | ${timeLabel}`,
              parentBlockId: block.id,
              slotIndex: Object.keys(slotTracker).length,
              courts: courtsObj,
            };

            currentTotalMins += totalSlotTime;
          }
        });
      });

      const slotKeys = Object.keys(slotTracker);
      const playerLastSlotIndex = {};

      pairs.forEach((pair) => {
        let finalTimeSlot = "TBD - Unschedulable";
        let finalCourt = "TBD";
        let status = "conflict";
        let scheduleSuccess = false;

        for (const key of slotKeys) {
          const slot = slotTracker[key];

          const p1Last = playerLastSlotIndex[pair.p1.id] ?? -99;
          const p2Last = playerLastSlotIndex[pair.p2.id] ?? -99;
          const currentIdx = slot.slotIndex;

          if (currentIdx - p1Last < 2 || currentIdx - p2Last < 2) {
            continue;
          }

          const p1Avail =
            pair.p1.availability &&
            Array.isArray(pair.p1.availability) &&
            pair.p1.availability.length > 0
              ? pair.p1.availability
              : allParentBlockIds;

          const p2Avail =
            pair.p2.availability &&
            Array.isArray(pair.p2.availability) &&
            pair.p2.availability.length > 0
              ? pair.p2.availability
              : allParentBlockIds;

          const hasAvailability =
            !rules.checkAvail ||
            (p1Avail.includes(slot.parentBlockId) &&
              p2Avail.includes(slot.parentBlockId));

          if (hasAvailability || !rules.checkAvail) {
            let assignedCourtName = null;
            for (let c = 1; c <= maxCourts; c++) {
              const courtKey = `Court ${c}`;
              if (!slot.courts[courtKey]) {
                slot.courts[courtKey] = true;
                assignedCourtName = courtKey;
                break;
              }
            }

            if (assignedCourtName) {
              finalCourt = assignedCourtName;
              finalTimeSlot = slot.label;
              status = "scheduled";
              scheduleSuccess = true;
              playerLastSlotIndex[pair.p1.id] = currentIdx;
              playerLastSlotIndex[pair.p2.id] = currentIdx;
              break;
            }
          }
        }

        if (!scheduleSuccess && slotKeys.length > 0) {
          for (const key of slotKeys) {
            const slot = slotTracker[key];
            for (let c = 1; c <= maxCourts; c++) {
              const courtKey = `Court ${c}`;
              if (!slot.courts[courtKey]) {
                slot.courts[courtKey] = true;
                finalCourt = courtKey;
                finalTimeSlot = slot.label;
                status = "scheduled";
                scheduleSuccess = true;
                break;
              }
            }
            if (scheduleSuccess) break;
          }
        }

        if (rules.strictAvail && !scheduleSuccess) return;

        const matchData = {
          type: genData.type,
          stage: pair.stage,
          teamA: [pair.p1.id],
          teamB: [pair.p2.id],
          court: finalCourt,
          timeSlot: finalTimeSlot,
          status: status,
          updatedAt: new Date().toISOString(),
        };

        const docRef = doc(collection(db, "matches"));
        batch.set(docRef, matchData);
        generatedMatches.push({ id: docRef.id, ...matchData });
      });

      await batch.commit();
      setMatches((prev) => [...generatedMatches, ...prev]);

      alert(
        `Generated ${generatedMatches.length} matches using ${maxCourts} court(s)!`,
      );
      setIsGenModalOpen(false);
    } catch (error) {
      console.error("Error generating matches:", error);
      alert("Failed to auto-generate matches.");
    } finally {
      setIsGenerating(false);
    }
  };

  const openNewMatchModal = () => {
    setEditingMatchId(null);
    setFormData({
      type: "singles",
      stage: "League",
      teamA: [""],
      teamB: [""],
      court: "Court 1",
      timeSlot: "",
      status: "scheduled",
    });
    setIsMatchModalOpen(true);
  };

  const openEditModal = (match) => {
    setEditingMatchId(match.id);
    setFormData({
      type: match.type || "singles",
      stage: match.stage || "League",
      teamA: [...match.teamA],
      teamB: [...match.teamB],
      court: match.court || "Court 1",
      timeSlot: match.timeSlot || "",
      status: match.status || "scheduled",
    });
    setIsMatchModalOpen(true);
  };

  const handleSaveMatch = async (e) => {
    e.preventDefault();
    const cleanTeamA = formData.teamA.filter((id) => id.trim() !== "");
    const cleanTeamB = formData.teamB.filter((id) => id.trim() !== "");

    let newStatus = formData.status;
    if (formData.timeSlot && !formData.timeSlot.includes("TBD"))
      newStatus = "scheduled";

    const matchData = {
      ...formData,
      teamA: cleanTeamA,
      teamB: cleanTeamB,
      status: newStatus,
      updatedAt: new Date().toISOString(),
    };

    try {
      if (editingMatchId) {
        await setDoc(doc(db, "matches", editingMatchId), matchData, {
          merge: true,
        });
        setMatches((prev) =>
          prev.map((m) =>
            m.id === editingMatchId ? { id: editingMatchId, ...matchData } : m,
          ),
        );
      } else {
        const docRef = await addDoc(collection(db, "matches"), matchData);
        setMatches((prev) => [{ id: docRef.id, ...matchData }, ...prev]);
      }
      setIsMatchModalOpen(false);
    } catch (error) {
      console.error("Error saving match:", error);
    }
  };

  const getPlayerName = (id) => players[id] || id || "TBD";
  const availableTimeSlots = tournamentDays.flatMap((day) =>
    day.slots.map((slot) => `${formatDisplayDate(day.date)} | ${slot.label}`),
  );

  // --- SMART CHRONOLOGICAL FILTER & SORT LOGIC ---
  const filteredAndSortedMatches = [...matches]
    .filter((match) => {
      const matchesDate =
        filterDate === "all" ||
        (match.timeSlot &&
          match.timeSlot.includes(formatDisplayDate(filterDate)));
      const matchesType = filterType === "all" || match.type === filterType;
      return matchesDate && matchesType;
    })
    .sort((a, b) => {
      let comparison = 0;
      if (sortBy === "time") {
        // Helper to convert time label into comparable minutes from midnight
        const parseTimeToMinutes = (timeSlotStr) => {
          if (!timeSlotStr || timeSlotStr.includes("TBD")) return 99999;
          try {
            const timePart = timeSlotStr
              .split("|")[1]
              ?.trim()
              .split("-")[0]
              ?.trim(); // e.g. "8:00 PM"
            if (!timePart) return 99999;
            const [time, modifier] = timePart.split(" ");
            let [hours, minutes] = time.split(":").map(Number);
            if (modifier === "PM" && hours < 12) hours += 12;
            if (modifier === "AM" && hours === 12) hours = 0;
            return hours * 60 + minutes;
          } catch {
            return 99999;
          }
        };
        comparison =
          parseTimeToMinutes(a.timeSlot) - parseTimeToMinutes(b.timeSlot);
      } else if (sortBy === "player") {
        const nameA = getPlayerName(a.teamA[0]) || "";
        const nameB = getPlayerName(b.teamA[0]) || "";
        comparison = nameA.localeCompare(nameB);
      }

      // Apply Up/Down Direction multiplier
      return sortDir === "asc" ? comparison : -comparison;
    });

  const ruleOptions = [
    { value: "none", label: "-- Ignore / Not Required --" },
    { value: "cat_same", label: "Group by Category (Play within own tag)" },
    { value: "cat_cross", label: "Cross-Category (Play outside own tag)" },
    {
      value: "avail_strict",
      label: "Strict Availability (Skip if no overlap)",
    },
    {
      value: "avail_loose",
      label: "Loose Availability (Create as TBD if no overlap)",
    },
  ];

  return (
    <>
      <div className="max-w-7xl mx-auto p-6 mt-10">
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">
              Match Schedule & Editor
            </h1>
            <p className="text-gray-500 mt-1">
              Manage fixtures and resolve availability conflicts.
            </p>
          </div>

          <div className="flex gap-3 flex-wrap items-center">
            {matches.length > 0 && (
              <button
                onClick={handleClearAllMatches}
                disabled={isClearing}
                className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded flex items-center gap-2 transition-colors shadow-sm disabled:opacity-50"
              >
                <Trash2 size={18} />{" "}
                {isClearing ? "Clearing..." : "Clear All Fixtures"}
              </button>
            )}
            <button
              onClick={() => setIsGenModalOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded flex items-center gap-2 transition-colors shadow-sm"
            >
              <Settings2 size={18} /> Smart-Gen Matches
            </button>
            <button
              onClick={openNewMatchModal}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded flex items-center gap-2 transition-colors shadow-sm"
            >
              <Plus size={18} /> Manual Match
            </button>
          </div>
        </div>

        {/* --- SEPARATE FILTER & SORT CONTROL BAR WITH DIRECTION TOGGLE --- */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 flex flex-wrap gap-4 items-center justify-between">
          <div className="flex flex-wrap gap-4 items-center flex-1">
            {/* Date Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-500 uppercase">
                Date:
              </span>
              <select
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="border p-2 rounded-lg text-sm bg-gray-50 outline-none font-medium text-gray-800"
              >
                <option value="all">All Days</option>
                {tournamentDays.map((day) => (
                  <option key={day.date} value={day.date}>
                    {formatDisplayDate(day.date)}
                  </option>
                ))}
              </select>
            </div>

            {/* Match Type Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-500 uppercase">
                Type:
              </span>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="border p-2 rounded-lg text-sm bg-gray-50 outline-none font-medium text-gray-800"
              >
                <option value="all">All Types</option>
                <option value="singles">Singles</option>
                <option value="doubles">Doubles</option>
              </select>
            </div>

            {/* Sort By & Direction Toggle */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-500 uppercase">
                Sort By:
              </span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="border p-2 rounded-lg text-sm bg-gray-50 outline-none font-medium text-gray-800"
              >
                <option value="time">Time</option>
                <option value="player">Player Name</option>
              </select>

              {/* Up/Down Direction Button */}
              <button
                onClick={() =>
                  setSortDir((prev) => (prev === "asc" ? "desc" : "asc"))
                }
                className="p-2 border rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-700 transition-colors"
                title={
                  sortDir === "asc" ? "Ascending (Up)" : "Descending (Down)"
                }
              >
                {sortDir === "asc" ? (
                  <ArrowUp size={16} />
                ) : (
                  <ArrowDown size={16} />
                )}
              </button>
            </div>
          </div>

          <div className="text-sm font-semibold text-gray-500">
            Showing{" "}
            <span className="text-indigo-600 font-bold">
              {filteredAndSortedMatches.length}
            </span>{" "}
            matches
          </div>
        </div>

        {/* Match List */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {isLoading ? (
            <p className="col-span-full text-gray-500">Loading match data...</p>
          ) : filteredAndSortedMatches.length === 0 ? (
            <p className="col-span-full text-center p-12 bg-white rounded-lg border border-dashed text-gray-500">
              No matches found matching these filters.
            </p>
          ) : (
            filteredAndSortedMatches.map((match) => (
              <div
                key={match.id}
                className={`bg-white rounded-lg shadow-sm border p-5 relative transition-all ${match.status === "conflict" ? "border-red-400 bg-red-50/30" : "border-gray-200"}`}
              >
                <div className="flex justify-between items-start mb-4 border-b pb-3">
                  <div>
                    <span
                      className={`text-xs font-bold uppercase tracking-wider px-2 py-1 rounded ${match.status === "conflict" ? "bg-red-100 text-red-800" : "bg-blue-50 text-blue-600"}`}
                    >
                      {match.stage} • {match.type}
                    </span>
                  </div>
                  <button
                    onClick={() => openEditModal(match)}
                    className="text-gray-400 hover:text-blue-600 transition-colors"
                  >
                    <Edit2 size={18} />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-gray-500">
                      Team 1
                    </span>
                    {match.teamA.map((id, idx) => (
                      <span
                        key={idx}
                        className="font-medium text-gray-900 truncate"
                      >
                        {getPlayerName(id)}
                      </span>
                    ))}
                  </div>

                  <div className="text-center font-bold text-gray-300 text-sm">
                    VS
                  </div>

                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-gray-500">
                      Team 2
                    </span>
                    {match.teamB.map((id, idx) => (
                      <span
                        key={idx}
                        className="font-medium text-gray-900 truncate"
                      >
                        {getPlayerName(id)}
                      </span>
                    ))}
                  </div>
                </div>

                <div
                  className={`mt-5 flex flex-col gap-2 text-xs font-medium p-2 rounded ${match.status === "conflict" ? "bg-red-100/50 text-red-700" : "bg-gray-50 text-gray-600"}`}
                >
                  {match.status === "conflict" && (
                    <div className="flex items-center gap-1 font-bold">
                      <AlertTriangle size={14} /> Conflict Detected
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <Clock size={14} /> {match.timeSlot || "TBD"}
                  </div>
                  <div className="flex items-center gap-1">
                    <MapPin size={14} /> {match.court || "TBD"}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* --- SMART GENERATOR MODAL --- */}
      {isGenModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[9999]">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="p-5 border-b bg-indigo-600 text-white flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Zap size={20} /> Matchmaking Engine
                </h2>
                <p className="text-indigo-100 text-sm">
                  Configure parameters to automatically generate fixtures.
                </p>
              </div>
              <button
                onClick={() => setIsGenModalOpen(false)}
                className="text-indigo-200 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={executeSmartGeneration} className="p-6">
              <div className="grid grid-cols-3 gap-3 mb-5">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Type
                  </label>
                  <select
                    value={genData.type}
                    onChange={(e) =>
                      setGenData({ ...genData, type: e.target.value })
                    }
                    className="w-full border p-2.5 rounded bg-gray-50 outline-none text-sm"
                  >
                    <option value="singles">Singles</option>
                    <option value="doubles">Doubles</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Max Matches
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={genData.maxMatchesPerPlayer}
                    onChange={(e) =>
                      setGenData({
                        ...genData,
                        maxMatchesPerPlayer: e.target.value,
                      })
                    }
                    className="w-full border p-2.5 rounded bg-gray-50 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Courts
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={genData.courtCount}
                    onChange={(e) =>
                      setGenData({ ...genData, courtCount: e.target.value })
                    }
                    className="w-full border p-2.5 rounded bg-gray-50 outline-none text-sm"
                  />
                </div>
              </div>

              <div className="space-y-3 mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <h3 className="font-bold text-gray-800 text-sm border-b pb-2">
                  Rule Hierarchy
                </h3>

                <div>
                  <label className="block text-xs font-bold text-indigo-600 uppercase mb-1">
                    Priority 1 (Primary Logic)
                  </label>
                  <select
                    value={genData.priority1}
                    onChange={(e) =>
                      setGenData({ ...genData, priority1: e.target.value })
                    }
                    className="w-full border p-2 rounded outline-none bg-white text-sm"
                  >
                    {ruleOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-indigo-600 uppercase mb-1">
                    Priority 2 (Secondary Logic)
                  </label>
                  <select
                    value={genData.priority2}
                    onChange={(e) =>
                      setGenData({ ...genData, priority2: e.target.value })
                    }
                    className="w-full border p-2 rounded outline-none bg-white text-sm"
                  >
                    {ruleOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                    Priority 3 (Fallback Logic)
                  </label>
                  <select
                    value={genData.priority3}
                    onChange={(e) =>
                      setGenData({ ...genData, priority3: e.target.value })
                    }
                    className="w-full border p-2 rounded outline-none bg-white text-sm"
                  >
                    {ruleOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsGenModalOpen(false)}
                  className="flex-1 px-4 py-3 border text-gray-700 font-bold rounded-lg hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isGenerating}
                  className="flex-1 px-4 py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex justify-center items-center gap-2"
                >
                  {isGenerating ? (
                    "Executing..."
                  ) : (
                    <>
                      <Zap size={18} /> Generate Setup
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MANUAL EDITOR MODAL --- */}
      {isMatchModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[9999] overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mt-10 mb-10">
            <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold">The Chaos Editor</h2>
                <p className="text-xs text-gray-500">
                  Use MHT IDs to assign players.
                </p>
              </div>
              {formData.status === "conflict" && (
                <span className="bg-red-100 text-red-800 text-xs font-bold px-2 py-1 rounded border border-red-200">
                  Needs Resolution
                </span>
              )}
            </div>

            <form onSubmit={handleSaveMatch} className="p-6">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Match Type
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => {
                      const newType = e.target.value;
                      setFormData({
                        ...formData,
                        type: newType,
                        teamA:
                          newType === "singles"
                            ? [formData.teamA[0] || ""]
                            : [
                                formData.teamA[0] || "",
                                formData.teamA[1] || "",
                              ],
                        teamB:
                          newType === "singles"
                            ? [formData.teamB[0] || ""]
                            : [
                                formData.teamB[0] || "",
                                formData.teamB[1] || "",
                              ],
                      });
                    }}
                    className="w-full border p-2 rounded outline-none"
                  >
                    <option value="singles">Singles</option>
                    <option value="doubles">Doubles</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Stage
                  </label>
                  <input
                    type="text"
                    value={formData.stage}
                    onChange={(e) =>
                      setFormData({ ...formData, stage: e.target.value })
                    }
                    className="w-full border p-2 rounded outline-none"
                    placeholder="e.g. Quarter Final"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8 mb-6 bg-gray-50 p-4 rounded border">
                <div>
                  <label className="block font-bold mb-2 text-blue-700">
                    Team 1 (MHT IDs)
                  </label>
                  {formData.teamA.map((id, index) => (
                    <div key={index} className="mb-2">
                      <input
                        type="text"
                        value={id}
                        onChange={(e) => {
                          const newTeam = [...formData.teamA];
                          newTeam[index] = e.target.value;
                          setFormData({ ...formData, teamA: newTeam });
                        }}
                        className="w-full border p-2 rounded mb-1 outline-none"
                        placeholder={`Player ${index + 1} ID`}
                      />
                      <span className="text-xs text-gray-500 block truncate">
                        Name: {players[id] || "Unknown ID"}
                      </span>
                    </div>
                  ))}
                </div>
                <div>
                  <label className="block font-bold mb-2 text-red-700">
                    Team 2 (MHT IDs)
                  </label>
                  {formData.teamB.map((id, index) => (
                    <div key={index} className="mb-2">
                      <input
                        type="text"
                        value={id}
                        onChange={(e) => {
                          const newTeam = [...formData.teamB];
                          newTeam[index] = e.target.value;
                          setFormData({ ...formData, teamB: newTeam });
                        }}
                        className="w-full border p-2 rounded mb-1 outline-none"
                        placeholder={`Player ${index + 1} ID`}
                      />
                      <span className="text-xs text-gray-500 block truncate">
                        Name: {players[id] || "Unknown ID"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Time Slot
                  </label>
                  <select
                    value={formData.timeSlot}
                    onChange={(e) =>
                      setFormData({ ...formData, timeSlot: e.target.value })
                    }
                    className={`w-full border p-2 rounded outline-none ${formData.timeSlot.includes("TBD") ? "border-red-400 bg-red-50 text-red-700" : ""}`}
                  >
                    <option value="">Select a time slot...</option>
                    {formData.timeSlot.includes("TBD") && (
                      <option value={formData.timeSlot}>
                        {formData.timeSlot}
                      </option>
                    )}
                    {availableTimeSlots.map((slotStr, i) => (
                      <option key={i} value={slotStr}>
                        {slotStr}
                      </option>
                    ))}
                    <option value="Custom">Custom / Manual Override</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Court
                  </label>
                  <select
                    value={formData.court}
                    onChange={(e) =>
                      setFormData({ ...formData, court: e.target.value })
                    }
                    className="w-full border p-2 rounded outline-none"
                  >
                    <option value="Court 1">Court 1</option>
                    <option value="Court 2">Court 2</option>
                    <option value="TBD">TBD</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsMatchModalOpen(false)}
                  className="px-4 py-2 border rounded hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Save Match
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
