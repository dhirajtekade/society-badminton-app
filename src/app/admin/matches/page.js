"use client";

import { useState, useEffect, Fragment } from "react";
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
  Zap,
  AlertTriangle,
  Settings2,
  X,
  Trash2,
  ArrowUp,
  ArrowDown,
  Trophy,
  CheckCircle2,
} from "lucide-react";
import { useTournament } from "@/components/TournamentSelector";

export default function AdminMatchesPage() {
  const {
    tournaments,
    activeTournament,
    switchTournament,
    createTournament,
    isLoading: tLoading,
  } = useTournament();
  const [showNewModal, setShowNewModal] = useState(false);
  const [newTourneyName, setNewTourneyName] = useState("");

  const [matches, setMatches] = useState([]);
  const [playersList, setPlayersList] = useState([]);
  const [players, setPlayers] = useState({});
  const [tournamentDays, setTournamentDays] = useState([]);
  const [playerCategories, setPlayerCategories] = useState([]);
  const [matchDuration, setMatchDuration] = useState(10);
  const [bufferTime, setBufferTime] = useState(5);
  const [isLoading, setIsLoading] = useState(true);

  // Filter & Sort States
  const [filterDate, setFilterDate] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [sortBy, setSortBy] = useState("time");
  const [sortDir, setSortDir] = useState("asc");
  const [showCategory, setShowCategory] = useState(false);

  // Modals & Feedback State
  const [isMatchModalOpen, setIsMatchModalOpen] = useState(false);
  const [isGenModalOpen, setIsGenModalOpen] = useState(false);
  const [editingMatchId, setEditingMatchId] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [genSummary, setGenSummary] = useState(null); // <-- NEW: Stores generation stats

  const [formData, setFormData] = useState({
    type: "singles",
    stage: "League",
    teamA: [""],
    teamB: [""],
    court: "Court 1",
    timeSlot: "",
    status: "scheduled",
    walkover: "",
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
    if (!activeTournament) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const settingsSnap = await getDoc(doc(db, "settings", "tournament"));
        if (settingsSnap.exists()) {
          const data = settingsSnap.data();
          if (data.tournamentDays) setTournamentDays(data.tournamentDays);
          if (data.playerCategories) setPlayerCategories(data.playerCategories);
          if (data.matchDuration) setMatchDuration(data.matchDuration);
          if (data.bufferTime) setBufferTime(data.bufferTime);
        }

        const masterSnap = await getDocs(collection(db, "players"));
        const masterDict = {};
        masterSnap.forEach((doc) => {
          masterDict[doc.id] = doc.data();
        });

        const playersSnap = await getDocs(
          collection(db, "tournaments", activeTournament.id, "players"),
        );
        const playersDict = {};
        const pList = [];

        playersSnap.forEach((doc) => {
          const tData = doc.data();
          const mData = masterDict[doc.id] || {};

          const mergedData = {
            id: doc.id,
            playsSingles: tData.playsSingles || false,
            playsDoubles: tData.playsDoubles || false,
            name: mData.name || tData.name || "Unknown",
            category: mData.category || "Uncategorized",
            availability: mData.availability || [],
          };

          playersDict[doc.id] = mergedData;
          pList.push(mergedData);
        });

        setPlayers(playersDict);
        setPlayersList(pList);

        const matchesSnap = await getDocs(
          collection(db, "tournaments", activeTournament.id, "matches"),
        );
        const fetchedMatches = [];
        matchesSnap.forEach((doc) => {
          fetchedMatches.push({ id: doc.id, ...doc.data() });
        });
        setMatches(fetchedMatches);
      } catch (error) {
        console.error("Error fetching tournament data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [activeTournament]);

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

  const formatStartTime = (timeSlotStr) => {
    if (!timeSlotStr || !timeSlotStr.includes("-")) return timeSlotStr || "TBD";
    return timeSlotStr.split("-")[0].trim();
  };

  const handleClearAllMatches = async () => {
    if (!confirm(`⚠️ Delete all matches for ${activeTournament.name}?`)) return;
    setIsClearing(true);
    setGenSummary(null);

    try {
      const matchesSnap = await getDocs(
        collection(db, "tournaments", activeTournament.id, "matches"),
      );
      const batch = writeBatch(db);
      matchesSnap.forEach((matchDoc) =>
        batch.delete(
          doc(db, "tournaments", activeTournament.id, "matches", matchDoc.id),
        ),
      );
      await batch.commit();
      setMatches([]);
    } catch (error) {
      console.error("Error clearing matches:", error);
    } finally {
      setIsClearing(false);
    }
  };

  const executeSmartGeneration = async (e) => {
    e.preventDefault();
    setIsGenerating(true);
    setGenSummary(null); // Clear previous summary

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
        const uniqueCategories = [
          ...new Set(
            activePlayers.map((p) => p.category?.trim() || "Uncategorized"),
          ),
        ];

        uniqueCategories.forEach((catName) => {
          const catPlayers = activePlayers.filter(
            (p) => (p.category?.trim() || "Uncategorized") === catName,
          );

          for (let i = 0; i < catPlayers.length; i++) {
            for (let offset = 1; offset < catPlayers.length; offset++) {
              const j = (i + offset) % catPlayers.length;
              if (i !== j)
                tryAddPair(catPlayers[i], catPlayers[j], `League: ${catName}`);
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

          if (currentIdx - p1Last < 2 || currentIdx - p2Last < 2) continue;

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

        const docRef = doc(
          collection(db, "tournaments", activeTournament.id, "matches"),
        );
        batch.set(docRef, matchData);
        generatedMatches.push({ id: docRef.id, ...matchData });
      });

      await batch.commit();
      setMatches((prev) => [...generatedMatches, ...prev]);

      // --- NEW: UI SUMMARY OBJECT ---
      let summaryObj = {
        total: generatedMatches.length,
        details: [],
      };

      if (rules.sameCategory) {
        const uniqueCategories = [
          ...new Set(
            activePlayers.map((p) => p.category?.trim() || "Uncategorized"),
          ),
        ];
        uniqueCategories.forEach((cat) => {
          const pCount = activePlayers.filter(
            (p) => (p.category?.trim() || "Uncategorized") === cat,
          ).length;
          const mCount = generatedMatches.filter(
            (m) => m.stage === `League: ${cat}`,
          ).length;
          if (pCount > 0) {
            summaryObj.details.push({ label: cat, pCount, mCount });
          }
        });
      } else {
        summaryObj.details.push({
          label: "General League",
          pCount: activePlayers.length,
          mCount: generatedMatches.length,
        });
      }

      setGenSummary(summaryObj);
      setIsGenModalOpen(false);
    } catch (error) {
      console.error("Error generating matches:", error);
      alert("Failed to auto-generate matches. Check console for details.");
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
      walkover: "",
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
      walkover: match.walkover || "",
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
        await setDoc(
          doc(
            db,
            "tournaments",
            activeTournament.id,
            "matches",
            editingMatchId,
          ),
          matchData,
          { merge: true },
        );
        setMatches((prev) =>
          prev.map((m) =>
            m.id === editingMatchId ? { id: editingMatchId, ...matchData } : m,
          ),
        );
      } else {
        const docRef = await addDoc(
          collection(db, "tournaments", activeTournament.id, "matches"),
          matchData,
        );
        setMatches((prev) => [{ id: docRef.id, ...matchData }, ...prev]);
      }
      setIsMatchModalOpen(false);
    } catch (error) {
      console.error("Error saving match:", error);
    }
  };

  const getPlayerName = (id) => players[id]?.name || id || "TBD";

  //   const getPlayerDisplay = (id) => {
  //     const p = players[id];
  //     if (!p) return id || "TBD";
  //     const name = p.name || id;
  //     if (showCategory && p.category && p.category.toLowerCase() !== "uncategorized") {
  //       return `${name} (${p.category})`;
  //     }
  //     return name;
  //   };

  const getPlayerDisplay = (id) => {
    const p = players[id];
    if (!p) return <span className="text-gray-500 italic">{id || "TBD"}</span>;
    const name = p.name || id;

    if (
      showCategory &&
      p.category &&
      p.category.toLowerCase() !== "uncategorized"
    ) {
      return (
        <span className="flex items-center gap-2">
          <span className="font-semibold text-gray-800">{name}</span>
          <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded">
            {p.category}
          </span>
        </span>
      );
    }
    return <span className="font-semibold text-gray-800">{name}</span>;
  };

  const availableTimeSlots = tournamentDays.flatMap((day) =>
    day.slots.map((slot) => `${formatDisplayDate(day.date)} | ${slot.label}`),
  );

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
        const parseTimeToMinutes = (timeSlotStr) => {
          if (!timeSlotStr || timeSlotStr.includes("TBD")) return 99999;
          try {
            const timePart = timeSlotStr
              .split("|")[1]
              ?.trim()
              .split("-")[0]
              ?.trim();
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
        const nameA = getPlayerName(a.teamA[0]);
        const nameB = getPlayerName(b.teamA[0]);
        comparison = nameA.localeCompare(nameB);
      }
      return sortDir === "asc" ? comparison : -comparison;
    });

  const groupedMatches = filteredAndSortedMatches.reduce((acc, match) => {
    const key = `${match.stage} • ${match.type}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(match);
    return acc;
  }, {});

  const copyWhatsAppSchedule = () => {
    let text = `🏸 *${activeTournament?.name} - Match Schedule* 🏸\n\n`;
    Object.entries(groupedMatches).forEach(([groupTitle, groupMatches]) => {
      text += `🏆 *${groupTitle.toUpperCase()}*\n`;
      groupMatches.forEach((m, idx) => {
        const p1 = m.teamA.map((id) => getPlayerDisplay(id)).join(" & ");
        const p2 = m.teamB.map((id) => getPlayerDisplay(id)).join(" & ");
        text += `  ${idx + 1}. ⚔️ ${p1} vs ${p2} | 🕒 ${formatStartTime(m.timeSlot)}\n`;
      });
      text += `\n`;
    });
    navigator.clipboard.writeText(text);
    alert("Match schedule copied to clipboard! Ready to paste into WhatsApp.");
  };

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

  if (tLoading)
    return (
      <div className="p-10 text-center text-gray-500">
        Loading tournaments...
      </div>
    );

  return (
    <>
      <div className="max-w-7xl mx-auto p-6 mt-10">
        {/* --- TOURNAMENT SELECTOR BANNER --- */}
        <div className="bg-indigo-900 text-white p-5 rounded-xl shadow-md mb-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-white/10 p-3 rounded-lg">
              <Trophy size={28} className="text-yellow-400" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-indigo-300">
                Active Tournament Context
              </div>
              <h1 className="text-2xl font-black">{activeTournament?.name}</h1>
            </div>
          </div>

          <div className="flex gap-3 items-center">
            <select
              value={activeTournament?.id || ""}
              onChange={(e) => switchTournament(e.target.value)}
              className="bg-indigo-800 text-white border border-indigo-700 p-2.5 rounded-lg font-bold outline-none cursor-pointer"
            >
              {tournaments.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => setShowNewModal(true)}
              className="bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-bold py-2.5 px-4 rounded-lg flex items-center gap-1.5 transition-colors text-sm"
            >
              <Plus size={16} /> New Tournament
            </button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">
              Match Schedule & Editor
            </h2>
            <p className="text-gray-500 mt-1">
              Managing fixtures for {activeTournament?.name}.
            </p>
          </div>

          <div className="flex gap-3 flex-wrap items-center">
            <button
              onClick={copyWhatsAppSchedule}
              className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded flex items-center gap-2 transition-colors shadow-sm"
            >
              📱 Copy WhatsApp Schedule
            </button>
            {matches.length > 0 && (
              <button
                onClick={handleClearAllMatches}
                disabled={isClearing}
                className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded flex items-center gap-2 transition-colors shadow-sm disabled:opacity-50"
              >
                <Trash2 size={18} /> {isClearing ? "Clearing..." : "Clear All"}
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

        {/* --- INLINE GENERATION SUMMARY ALERT --- */}
        {genSummary && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 mb-6 relative shadow-sm transition-all">
            <button
              onClick={() => setGenSummary(null)}
              className="absolute top-4 right-4 text-emerald-600 hover:text-emerald-800 transition-colors"
            >
              <X size={20} />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-emerald-100 p-2 rounded-full text-emerald-700">
                <CheckCircle2 size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-emerald-800">
                  Successfully Generated!
                </h3>
                <p className="text-emerald-600 text-sm font-medium">
                  Engine created{" "}
                  <span className="font-bold">
                    {genSummary.total} total matches
                  </span>{" "}
                  based on your rules.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {genSummary.details.map((detail, idx) => (
                <div
                  key={idx}
                  className="bg-white rounded-lg p-3 border border-emerald-100 shadow-sm flex flex-col justify-center"
                >
                  <span className="text-xs font-black text-emerald-600 uppercase tracking-wider mb-1.5">
                    {detail.label}
                  </span>
                  <div className="flex justify-between items-center text-sm font-medium text-gray-700">
                    <span>{detail.pCount} Players</span>
                    <span className="text-gray-300">➔</span>
                    <span className="font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded">
                      {detail.mCount} Matches
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- FILTER & SORT CONTROL BAR --- */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 flex flex-wrap gap-4 items-center justify-between">
          <div className="flex flex-wrap gap-4 items-center flex-1">
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

              <button
                onClick={() =>
                  setSortDir((prev) => (prev === "asc" ? "desc" : "asc"))
                }
                className="p-2 border rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-700 transition-colors"
              >
                {sortDir === "asc" ? (
                  <ArrowUp size={16} />
                ) : (
                  <ArrowDown size={16} />
                )}
              </button>
            </div>

            {/* --- SHOW CATEGORY TOGGLE --- */}
            <div className="flex items-center gap-2 ml-2 pl-4 border-l border-gray-200">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-600 uppercase">
                <input
                  type="checkbox"
                  checked={showCategory}
                  onChange={(e) => setShowCategory(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded cursor-pointer"
                />
                Show Tags
              </label>
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

        {/* --- COMPACT CATEGORY TABLE VIEW --- */}
        <div className="flex flex-col gap-6">
          {isLoading ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center text-gray-500">
              Loading matches...
            </div>
          ) : filteredAndSortedMatches.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-500">
              No matches found for this tournament.
            </div>
          ) : (
            Object.entries(groupedMatches).map(
              ([groupTitle, matchesInGroup]) => (
                <div
                  key={groupTitle}
                  className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
                >
                  {/* --- GROUP HEADER --- */}
                  <div className="bg-indigo-50/80 p-4 border-b border-indigo-100 flex items-center justify-between">
                    <h3 className="font-black text-indigo-900 uppercase tracking-wider">
                      {groupTitle}
                    </h3>
                    <span className="text-xs font-bold text-indigo-600 bg-indigo-100 px-2 py-1 rounded">
                      {matchesInGroup.length} Matches
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">
                          <th className="p-4 w-1/3">Team 1</th>
                          <th className="p-4 text-center w-16">VS</th>
                          <th className="p-4 w-1/3">Team 2</th>
                          <th className="p-4">Date & Time</th>
                          <th className="p-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 text-sm">
                        {matchesInGroup.map((match) => (
                          <tr
                            key={match.id}
                            className={`hover:bg-gray-50/80 transition-colors ${match.status === "conflict" ? "bg-red-50/40" : ""}`}
                          >
                            <td className="p-4 font-semibold text-gray-800">
                              {match.teamA.map((id, idx) => (
                                <div key={idx}>{getPlayerDisplay(id)}</div>
                              ))}
                            </td>
                            <td className="p-4 text-center font-bold text-gray-300">
                              VS
                            </td>
                            <td className="p-4 font-semibold text-gray-800">
                              {match.teamB.map((id, idx) => (
                                <div key={idx}>{getPlayerDisplay(id)}</div>
                              ))}
                            </td>
                            <td className="p-4 text-gray-600 font-medium whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                {match.status === "conflict" && (
                                  <AlertTriangle
                                    size={14}
                                    className="text-red-500"
                                  />
                                )}
                                <Clock size={14} className="text-gray-400" />
                                {formatStartTime(match.timeSlot)}
                              </div>
                            </td>
                            <td className="p-4 text-right">
                              <button
                                onClick={() => openEditModal(match)}
                                className="text-gray-400 hover:text-blue-600 p-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                                title="Edit Match"
                              >
                                <Edit2 size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ),
            )
          )}
        </div>
      </div>

      {/* --- NEW TOURNAMENT MODAL --- */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[9999]">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-2">
              Create New Tournament
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Enter a name for the new tournament category/event.
            </p>
            <input
              type="text"
              value={newTourneyName}
              onChange={(e) => setNewTourneyName(e.target.value)}
              placeholder="e.g. Winter Open 2026"
              className="w-full border p-2.5 rounded-lg mb-4 outline-none text-sm"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowNewModal(false)}
                className="flex-1 px-4 py-2 border rounded-lg text-sm font-bold"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  createTournament(newTourneyName);
                  setNewTourneyName("");
                  setShowNewModal(false);
                }}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

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
                  Generating for {activeTournament?.name}
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
                    Priority 1
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
                    Priority 2
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
                    Priority 3
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
                  className="flex-1 px-4 py-3 border text-gray-700 font-bold rounded-lg hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isGenerating}
                  className="flex-1 px-4 py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex justify-center items-center gap-2"
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
                <h2 className="text-lg font-bold">Match Editor</h2>
                <p className="text-xs text-gray-500">
                  Edit match details for {activeTournament?.name}.
                </p>
              </div>
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
                        Name: {players[id]?.name || "Unknown ID"}
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
                        Name: {players[id]?.name || "Unknown ID"}
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
                    className="w-full border p-2 rounded outline-none"
                  >
                    <option value="">Select a time slot...</option>
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
