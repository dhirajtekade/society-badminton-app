"use client";

import { useState, useEffect, Fragment } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  doc,
  setDoc,
  addDoc,
  deleteDoc,
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
  List,
  CalendarDays,
  GripVertical,
  Search,
  UserX,
  UserPlus,
  Printer, // NEW: Added Printer icon
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

  // --- VIEW MODES ---
  const [viewMode, setViewMode] = useState("list");

  // Filter & Sort States
  const [filterDate, setFilterDate] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [sortBy, setSortBy] = useState("time");
  const [sortDir, setSortDir] = useState("asc");
  const [showCategory, setShowCategory] = useState(false);

  // Builder States
  const [builderDate, setBuilderDate] = useState("");
  const [builderType, setBuilderType] = useState("singles");
  const [rosterSearch, setRosterSearch] = useState("");

  // Modals & Feedback State
  const [isMatchModalOpen, setIsMatchModalOpen] = useState(false);
  const [isGenModalOpen, setIsGenModalOpen] = useState(false);
  const [editingMatchId, setEditingMatchId] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [genSummary, setGenSummary] = useState(null);

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
          if (data.tournamentDays) {
            setTournamentDays(data.tournamentDays);
            if (data.tournamentDays.length > 0)
              setBuilderDate(data.tournamentDays[0].date);
          }
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
            partnerMhtId: tData.partnerMhtId || null,
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

  const calculatePreciseTime = (timeSlotStr, matchIndex) => {
    if (!timeSlotStr || !timeSlotStr.includes("|")) return timeSlotStr || "TBD";
    if (timeSlotStr.includes("TBD")) return "TBD";

    try {
      const timePart = timeSlotStr.split("|")[1].split("-")[0].trim();
      const [time, modifier] = timePart.split(" ");
      let [hours, minutes] = time.split(":").map(Number);

      if (modifier === "PM" && hours < 12) hours += 12;
      if (modifier === "AM" && hours === 12) hours = 0;

      const totalMinsPerMatch =
        (parseInt(matchDuration, 10) || 10) + (parseInt(bufferTime, 10) || 5);
      const addedMins = matchIndex * totalMinsPerMatch;

      let newTotalMins = hours * 60 + minutes + addedMins;

      const newH = Math.floor(newTotalMins / 60);
      const newM = newTotalMins % 60;

      return formatTime12h(newH, newM);
    } catch (e) {
      return formatStartTime(timeSlotStr);
    }
  };

  const getEnrichedMatches = () => {
    const groups = {};
    matches.forEach((m) => {
      const key = `${m.timeSlot}_${m.type}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(m);
    });

    const enriched = [];
    Object.values(groups).forEach((group) => {
      group.sort((a, b) => {
        if (a.order !== undefined && b.order !== undefined)
          return a.order - b.order;
        return (
          new Date(a.createdAt || a.updatedAt || 0) -
          new Date(b.createdAt || b.updatedAt || 0)
        );
      });
      group.forEach((m, idx) => {
        enriched.push({
          ...m,
          computedStartTime: calculatePreciseTime(m.timeSlot, idx),
        });
      });
    });
    return enriched;
  };

  const enrichedMatchesList = getEnrichedMatches();

  const availableTimeSlots = tournamentDays.flatMap((day) =>
    day.slots.map((slot) => `${formatDisplayDate(day.date)} | ${slot.label}`),
  );

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

      const newPlayerObj = {
        id: cleanMhtid,
        name: cleanName,
        category: cleanCategory,
        playsSingles: newPlayer.playsSingles,
        playsDoubles: newPlayer.playsDoubles,
        availability: [],
        partnerMhtId: null,
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

      setPlayers((prev) => ({
        ...prev,
        [cleanMhtid]: newPlayerObj,
      }));

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

  const handleMoveToDate = async (match, targetDateRaw) => {
    if (!targetDateRaw) return;
    const targetDateStr = formatDisplayDate(targetDateRaw);
    const newTimeSlot = `${targetDateStr} | TBD`;

    try {
      await setDoc(
        doc(db, "tournaments", activeTournament.id, "matches", match.id),
        {
          timeSlot: newTimeSlot,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );

      setMatches((prev) =>
        prev.map((m) =>
          m.id === match.id ? { ...m, timeSlot: newTimeSlot } : m,
        ),
      );
    } catch (error) {
      console.error("Error moving match to another date:", error);
      alert("Failed to move match date.");
    }
  };

  // --- TIMELINE BUILDER DYNAMIC SLOTS ---
  const displayDateStr = builderDate ? formatDisplayDate(builderDate) : "";
  const builderTimeSlots = availableTimeSlots.filter(
    (slot) => displayDateStr && slot.includes(displayDateStr),
  );
  if (displayDateStr && !builderTimeSlots.includes(`${displayDateStr} | TBD`)) {
    builderTimeSlots.push(`${displayDateStr} | TBD`);
  }

  const filteredRoster = playersList.filter((p) => {
    const playsRightType =
      builderType === "singles" ? p.playsSingles : p.playsDoubles;
    const matchesSearch =
      p.name.toLowerCase().includes(rosterSearch.toLowerCase()) ||
      p.id.toLowerCase().includes(rosterSearch.toLowerCase());
    return playsRightType && matchesSearch;
  });

  const handlePlayerDragStart = (e, playerId) => {
    e.dataTransfer.setData("playerId", playerId);
    e.dataTransfer.effectAllowed = "copy";
  };

  const handlePlayerDrop = async (
    e,
    timeSlotStr,
    teamKey,
    playerIndex,
    matchId,
  ) => {
    e.preventDefault();
    const playerId = e.dataTransfer.getData("playerId");
    if (!playerId) return;

    const playerName = getPlayerName(playerId);
    const maxPlayersPerTeam = builderType === "singles" ? 1 : 2;

    let proposedTeamA, proposedTeamB, existingMatch;

    if (matchId) {
      existingMatch = matches.find((m) => m.id === matchId);
      if (!existingMatch) return;
      proposedTeamA = [...existingMatch.teamA];
      proposedTeamB = [...existingMatch.teamB];
    } else {
      proposedTeamA = Array(maxPlayersPerTeam).fill("");
      proposedTeamB = Array(maxPlayersPerTeam).fill("");
    }

    if (teamKey === "teamA") proposedTeamA[playerIndex] = playerId;
    if (teamKey === "teamB") proposedTeamB[playerIndex] = playerId;

    const allPlayersInProposedMatch = [
      ...proposedTeamA,
      ...proposedTeamB,
    ].filter((id) => id.trim() !== "");
    if (allPlayersInProposedMatch.filter((id) => id === playerId).length > 1) {
      alert(`❌ ${playerName} is already playing in this specific match!`);
      return;
    }

    const wasAlreadyInMatch =
      existingMatch &&
      [...existingMatch.teamA, ...existingMatch.teamB].includes(playerId);
    if (!wasAlreadyInMatch) {
      const playerMatchCount = matches.filter(
        (m) => m.teamA.includes(playerId) || m.teamB.includes(playerId),
      ).length;
      if (playerMatchCount >= 2) {
        const proceed = window.confirm(
          `⚠️ Warning: ${playerName} is already scheduled for ${playerMatchCount} matches.\n\nAre you sure you want to assign them to an additional match?`,
        );
        if (!proceed) return;
      }
    }

    const isTeamAComplete = proposedTeamA.every((id) => id.trim() !== "");
    const isTeamBComplete = proposedTeamB.every((id) => id.trim() !== "");

    if (isTeamAComplete && isTeamBComplete) {
      const pAStr = proposedTeamA.slice().sort().join(",");
      const pBStr = proposedTeamB.slice().sort().join(",");

      const duplicateMatch = matches.find((m) => {
        if (m.id === matchId) return false;
        if (m.type !== builderType) return false;

        const mAStr = m.teamA.slice().sort().join(",");
        const mBStr = m.teamB.slice().sort().join(",");

        return (
          (pAStr === mAStr && pBStr === mBStr) ||
          (pAStr === mBStr && pBStr === mAStr)
        );
      });

      if (duplicateMatch) {
        alert(
          "❌ This exact matchup has already been created elsewhere in the tournament!",
        );
        return;
      }
    }

    if (matchId) {
      const updatedData = {
        [teamKey]: teamKey === "teamA" ? proposedTeamA : proposedTeamB,
        updatedAt: new Date().toISOString(),
      };
      try {
        await setDoc(
          doc(db, "tournaments", activeTournament.id, "matches", matchId),
          updatedData,
          { merge: true },
        );
        setMatches((prev) =>
          prev.map((m) => (m.id === matchId ? { ...m, ...updatedData } : m)),
        );
      } catch (err) {
        console.error("Error updating match slot:", err);
      }
    } else {
      const newMatchData = {
        type: builderType,
        stage: "Manual Fixture",
        teamA: proposedTeamA,
        teamB: proposedTeamB,
        court: "Court 1",
        timeSlot: timeSlotStr,
        status: "scheduled",
        walkover: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        order: Date.now(),
      };

      try {
        const docRef = await addDoc(
          collection(db, "tournaments", activeTournament.id, "matches"),
          newMatchData,
        );
        setMatches((prev) => [...prev, { id: docRef.id, ...newMatchData }]);
      } catch (err) {
        console.error("Error creating new match from drop:", err);
      }
    }
  };

  const handleRemovePlayerFromSlot = async (matchId, teamKey, playerIndex) => {
    const existingMatch = matches.find((m) => m.id === matchId);
    if (!existingMatch) return;

    const updatedTeam = [...existingMatch[teamKey]];
    updatedTeam[playerIndex] = "";

    const newTeamA = teamKey === "teamA" ? updatedTeam : existingMatch.teamA;
    const newTeamB = teamKey === "teamB" ? updatedTeam : existingMatch.teamB;

    const isEmpty = newTeamA.every((id) => !id) && newTeamB.every((id) => !id);

    if (isEmpty) {
      try {
        await deleteDoc(
          doc(db, "tournaments", activeTournament.id, "matches", matchId),
        );
        setMatches((prev) => prev.filter((m) => m.id !== matchId));
      } catch (err) {
        console.error("Error deleting empty match:", err);
      }
    } else {
      const updatedData = {
        [teamKey]: updatedTeam,
        updatedAt: new Date().toISOString(),
      };
      try {
        await setDoc(
          doc(db, "tournaments", activeTournament.id, "matches", matchId),
          updatedData,
          { merge: true },
        );
        setMatches((prev) =>
          prev.map((m) => (m.id === matchId ? { ...m, ...updatedData } : m)),
        );
      } catch (err) {
        console.error("Error clearing player slot:", err);
      }
    }
  };

  const handleMoveMatchSequence = async (match, direction) => {
    const slotMatches = matches
      .filter((m) => m.timeSlot === match.timeSlot && m.type === match.type)
      .sort((a, b) => {
        if (a.order !== undefined && b.order !== undefined)
          return a.order - b.order;
        return (
          new Date(a.createdAt || a.updatedAt || 0) -
          new Date(b.createdAt || b.updatedAt || 0)
        );
      });

    const currentIndex = slotMatches.findIndex((m) => m.id === match.id);
    if (currentIndex === -1) return;

    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= slotMatches.length) return;

    const batch = writeBatch(db);
    const newOrders = {};

    slotMatches.forEach((m, idx) => {
      let newIdx = idx;
      if (idx === currentIndex) newIdx = targetIndex;
      else if (idx === targetIndex) newIdx = currentIndex;

      newOrders[m.id] = newIdx;
      batch.update(
        doc(db, "tournaments", activeTournament.id, "matches", m.id),
        { order: newIdx },
      );
    });

    try {
      await batch.commit();
      setMatches((prev) =>
        prev.map((m) => {
          if (newOrders[m.id] !== undefined) {
            return { ...m, order: newOrders[m.id] };
          }
          return m;
        }),
      );
    } catch (error) {
      console.error("Error updating match sequence:", error);
    }
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
    setGenSummary(null);

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
        fixedPartner: allPriorities.includes("fixed_partner"),
      };

      const activePlayers = playersList.filter((p) =>
        genData.type === "singles" ? p.playsSingles : p.playsDoubles,
      );

      let teams = [];
      if (genData.type === "doubles") {
        let pairedIds = new Set();

        if (rules.fixedPartner) {
          activePlayers.forEach((p1) => {
            if (pairedIds.has(p1.id) || !p1.partnerMhtId) return;
            const p2 = activePlayers.find(
              (p) => p.id === p1.partnerMhtId && !pairedIds.has(p.id),
            );
            if (p2) {
              teams.push([p1, p2]);
              pairedIds.add(p1.id);
              pairedIds.add(p2.id);
            }
          });
        }

        const remaining = activePlayers
          .filter((p) => !pairedIds.has(p.id))
          .sort(() => Math.random() - 0.5);

        for (let i = 0; i < remaining.length; i += 2) {
          if (remaining[i + 1]) {
            teams.push([remaining[i], remaining[i + 1]]);
          } else {
            teams.push([remaining[i]]);
          }
        }
      } else {
        teams = activePlayers.map((p) => [p]);
      }

      const pairs = [];
      const matchCounts = {};
      activePlayers.forEach((p) => (matchCounts[p.id] = 0));

      const tryAddPair = (t1, t2, stageName) => {
        const t1Ids = t1.map((p) => p.id);
        const t2Ids = t2.map((p) => p.id);

        if (
          t1Ids.every((id) => matchCounts[id] < maxLimit) &&
          t2Ids.every((id) => matchCounts[id] < maxLimit)
        ) {
          const exists = pairs.some(
            (m) =>
              (m.t1.map((p) => p.id).join() === t1Ids.join() &&
                m.t2.map((p) => p.id).join() === t2Ids.join()) ||
              (m.t1.map((p) => p.id).join() === t2Ids.join() &&
                m.t2.map((p) => p.id).join() === t1Ids.join()),
          );
          if (!exists) {
            pairs.push({ t1, t2, stage: stageName });
            t1Ids.forEach((id) => matchCounts[id]++);
            t2Ids.forEach((id) => matchCounts[id]++);
            return true;
          }
        }
        return false;
      };

      if (rules.sameCategory) {
        const uniqueCategories = [
          ...new Set(
            teams.map((t) => t[0].category?.trim() || "Uncategorized"),
          ),
        ];

        uniqueCategories.forEach((catName) => {
          const catTeams = teams.filter(
            (t) => (t[0].category?.trim() || "Uncategorized") === catName,
          );

          for (let i = 0; i < catTeams.length; i++) {
            for (let offset = 1; offset < catTeams.length; offset++) {
              const j = (i + offset) % catTeams.length;
              if (i !== j)
                tryAddPair(catTeams[i], catTeams[j], `League: ${catName}`);
            }
          }
        });
      } else {
        for (let i = 0; i < teams.length; i++) {
          for (let offset = 1; offset < teams.length; offset++) {
            const j = (i + offset) % teams.length;
            if (i !== j) tryAddPair(teams[i], teams[j], "General League");
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

      pairs.forEach((pair, globalIdx) => {
        let finalTimeSlot = "TBD - Unschedulable";
        let finalCourt = "TBD";
        let status = "conflict";
        let scheduleSuccess = false;

        for (const key of slotKeys) {
          const slot = slotTracker[key];

          const getTeamLastSlot = (team) =>
            Math.max(...team.map((p) => playerLastSlotIndex[p.id] ?? -99));

          const t1Last = getTeamLastSlot(pair.t1);
          const t2Last = getTeamLastSlot(pair.t2);
          const currentIdx = slot.slotIndex;

          if (currentIdx - t1Last < 2 || currentIdx - t2Last < 2) continue;

          const getTeamAvail = (team) => {
            let avail = allParentBlockIds;
            team.forEach((p) => {
              if (
                p.availability &&
                Array.isArray(p.availability) &&
                p.availability.length > 0
              ) {
                avail = avail.filter((a) => p.availability.includes(a));
              }
            });
            return avail;
          };

          const t1Avail = getTeamAvail(pair.t1);
          const t2Avail = getTeamAvail(pair.t2);

          const hasAvailability =
            !rules.checkAvail ||
            (t1Avail.includes(slot.parentBlockId) &&
              t2Avail.includes(slot.parentBlockId));

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
              pair.t1.forEach((p) => (playerLastSlotIndex[p.id] = currentIdx));
              pair.t2.forEach((p) => (playerLastSlotIndex[p.id] = currentIdx));
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
          teamA: pair.t1.map((p) => p.id),
          teamB: pair.t2.map((p) => p.id),
          court: finalCourt,
          timeSlot: finalTimeSlot,
          status: status,
          order: globalIdx,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const docRef = doc(
          collection(db, "tournaments", activeTournament.id, "matches"),
        );
        batch.set(docRef, matchData);
        generatedMatches.push({ id: docRef.id, ...matchData });
      });

      await batch.commit();
      setMatches((prev) => [...prev, ...generatedMatches]);

      let summaryObj = {
        total: generatedMatches.length,
        details: [],
      };

      if (rules.sameCategory) {
        const uniqueCategories = [
          ...new Set(
            teams.map((t) => t[0].category?.trim() || "Uncategorized"),
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
        matchData.createdAt = new Date().toISOString();
        matchData.order = Date.now();

        const docRef = await addDoc(
          collection(db, "tournaments", activeTournament.id, "matches"),
          matchData,
        );
        setMatches((prev) => [...prev, { id: docRef.id, ...matchData }]);
      }
      setIsMatchModalOpen(false);
    } catch (error) {
      console.error("Error saving match:", error);
    }
  };

  const getPlayerName = (id) => players[id]?.name || id || "TBD";

  const getPlayerDisplay = (id, match) => {
    const p = players[id];
    const rsvp = match?.rsvps?.[id] || "pending";

    let dotColor = "bg-yellow-400";
    if (rsvp === "available") dotColor = "bg-emerald-500";
    if (rsvp === "unavailable") dotColor = "bg-red-500";

    if (!p)
      return (
        <span className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`}
            title="Pending"
          ></span>
          <span className="text-gray-500 italic">{id || "TBD"}</span>
        </span>
      );

    const name = p.name || id;

    return (
      <span className="flex items-center gap-1.5 overflow-hidden">
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`}
          title={rsvp}
        ></span>
        <span className="font-semibold text-gray-800 truncate">{name}</span>
        {showCategory &&
          p.category &&
          p.category.toLowerCase() !== "uncategorized" && (
            <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0">
              {p.category}
            </span>
          )}
      </span>
    );
  };

  const filteredAndSortedMatches = [...enrichedMatchesList]
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
        const timeA = parseTimeToMinutes(a.timeSlot);
        const timeB = parseTimeToMinutes(b.timeSlot);
        if (timeA === timeB) {
          const orderA =
            a.order !== undefined ? a.order : new Date(a.createdAt).getTime();
          const orderB =
            b.order !== undefined ? b.order : new Date(b.createdAt).getTime();
          comparison = orderA - orderB;
        } else {
          comparison = timeA - timeB;
        }
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
        const p1 = m.teamA.map((id) => getPlayerName(id)).join(" & ");
        const p2 = m.teamB.map((id) => getPlayerName(id)).join(" & ");
        text += `  ${idx + 1}. ⚔️ ${p1} vs ${p2} | 🕒 ${m.computedStartTime}\n`;
      });
      text += `\n`;
    });
    navigator.clipboard.writeText(text);
    alert("Match schedule copied to clipboard! Ready to paste into WhatsApp.");
  };

  // --- NEW: PRINT PDF SCORECARDS LOGIC ---
  const handlePrintScorecards = () => {
    if (filteredAndSortedMatches.length === 0) {
      alert("No matches to print for the current view.");
      return;
    }

    const printWindow = window.open("", "", "height=800,width=800");

    let html = `
      <html>
        <head>
          <title>${activeTournament?.name} - Score Sheets</title>
          <style>
            body { 
              font-family: system-ui, -apple-system, sans-serif; 
              padding: 20px; 
              color: #111; 
            }
            .header-banner {
              text-align: center;
              margin-bottom: 30px;
              border-bottom: 2px solid #000;
              padding-bottom: 10px;
            }
            .header-banner h1 { margin: 0 0 5px 0; font-size: 24px; }
            .header-banner p { margin: 0; color: #555; }
            .match-card { 
              border: 2px solid #222; 
              border-radius: 8px; 
              margin-bottom: 30px; 
              padding: 20px; 
              page-break-inside: avoid; 
            }
            .card-header { 
              display: flex; 
              justify-content: space-between; 
              border-bottom: 1px solid #ccc; 
              padding-bottom: 10px; 
              margin-bottom: 15px; 
              font-weight: bold;
              font-size: 14px;
              color: #444;
            }
            .players { 
              display: flex; 
              justify-content: space-between; 
              align-items: center; 
              font-size: 20px; 
              font-weight: 900; 
              margin-bottom: 25px; 
            }
            .vs { 
              color: #888; 
              font-size: 16px; 
            }
            .scores-container {
              display: flex;
              justify-content: space-between;
              align-items: center;
              background-color: #f9f9f9;
              padding: 15px;
              border-radius: 6px;
            }
            .score-boxes {
              display: flex;
              gap: 15px;
            }
            .score-box { 
              width: 70px; 
              height: 60px; 
              border: 2px solid #aaa; 
              border-radius: 6px; 
              background-color: #fff;
            }
            .score-label {
              width: 60px;
              text-align: center;
              font-weight: bold;
              color: #888;
              font-size: 12px;
              letter-spacing: 1px;
            }
            .footer { 
              margin-top: 25px; 
              display: flex;
              justify-content: space-between;
              font-size: 14px; 
              color: #333; 
            }
            .sig-line {
              border-bottom: 1px solid #000;
              width: 200px;
              display: inline-block;
            }
            @media print {
              body { padding: 0; }
              @page { margin: 1cm; }
            }
          </style>
        </head>
        <body>
          <div class="header-banner">
            <h1>${activeTournament?.name}</h1>
            <p>Official Match Scorecards</p>
          </div>
    `;

    filteredAndSortedMatches.forEach((m, i) => {
      const teamA = m.teamA.map((id) => getPlayerName(id)).join(" & ");
      const teamB = m.teamB.map((id) => getPlayerName(id)).join(" & ");
      const timeDisplay =
        m.computedStartTime !== "TBD"
          ? m.computedStartTime
          : formatStartTime(m.timeSlot);

      html += `
        <div class="match-card">
          <div class="card-header">
            <span>MATCH #${i + 1} &nbsp;|&nbsp; ${timeDisplay} &nbsp;|&nbsp; ${m.type.toUpperCase()}</span>
            <span>COURT: ${m.court} &nbsp;|&nbsp; STAGE: ${m.stage}</span>
          </div>
          
          <div class="players">
            <div style="flex:1;">${teamA || "TBD"}</div>
            <div class="vs">VS</div>
            <div style="flex:1; text-align:right;">${teamB || "TBD"}</div>
          </div>
          
          <div class="scores-container">
            <div class="score-boxes">
              <div class="score-box"></div>
              <div class="score-box"></div>
              <div class="score-box"></div>
            </div>
            
            <div class="score-label">SETS</div>
            
            <div class="score-boxes">
              <div class="score-box"></div>
              <div class="score-box"></div>
              <div class="score-box"></div>
            </div>
          </div>
          
          <div class="footer">
            <div>Match Winner: <span class="sig-line" style="width: 150px;"></span></div>
            <div>Referee Signature: <span class="sig-line"></span></div>
          </div>
        </div>
      `;
    });

    html += `
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();

    // Allow styles to load before calling print
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  const ruleOptions = [
    { value: "none", label: "-- Ignore / Not Required --" },
    { value: "fixed_partner", label: "Predefined Partner (Excel Import)" },
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

            {/* NEW: PRINT PDF BUTTON */}
            <button
              onClick={handlePrintScorecards}
              className="bg-gray-800 hover:bg-gray-900 text-white font-medium py-2 px-4 rounded flex items-center gap-2 transition-colors shadow-sm"
            >
              <Printer size={18} /> Print Scorecards
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

            {/* VIEW TOGGLES */}
            <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200 ml-2">
              <button
                onClick={() => setViewMode("list")}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-md transition-all ${viewMode === "list" ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
              >
                <List size={16} /> List View
              </button>
              <button
                onClick={() => setViewMode("builder")}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-md transition-all ${viewMode === "builder" ? "bg-indigo-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
              >
                <CalendarDays size={16} /> Builder
              </button>
            </div>
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

        {/* =========================================================================
            VIEW 1: TRADITIONAL LIST VIEW
            ========================================================================= */}
        {viewMode === "list" && (
          <div className="animate-in fade-in">
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
                                    <div key={idx}>
                                      {getPlayerDisplay(id, match)}
                                    </div>
                                  ))}
                                </td>
                                <td className="p-4 text-center font-bold text-gray-300">
                                  VS
                                </td>
                                <td className="p-4 font-semibold text-gray-800">
                                  {match.teamB.map((id, idx) => (
                                    <div key={idx}>
                                      {getPlayerDisplay(id, match)}
                                    </div>
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
                                    <Clock
                                      size={14}
                                      className="text-gray-400"
                                    />
                                    {match.computedStartTime}
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
        )}

        {/* =========================================================================
            VIEW 2: DRAG & DROP TIMELINE BUILDER
            ========================================================================= */}
        {viewMode === "builder" && (
          <div className="flex flex-col lg:flex-row gap-6 animate-in fade-in">
            {/* LEFT SIDEBAR: DRAGGABLE PLAYER ROSTER */}
            <div className="w-full lg:w-80 shrink-0">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden sticky top-24 max-h-[calc(100vh-8rem)] flex flex-col">
                <div className="bg-indigo-900 text-white p-4 flex justify-between items-center">
                  <div>
                    <h3 className="font-black text-lg">Player Roster</h3>
                    <p className="text-xs text-indigo-300 font-medium">
                      Drag players onto the timeline
                    </p>
                  </div>
                  <button
                    onClick={() => setIsAddModalOpen(true)}
                    className="bg-indigo-700 hover:bg-indigo-600 p-2 rounded-lg transition-colors text-white shadow-sm"
                    title="Add New Player"
                  >
                    <UserPlus size={18} />
                  </button>
                </div>

                <div className="p-3 border-b border-gray-100 flex flex-col gap-3 bg-gray-50">
                  <div className="flex gap-2 p-1 bg-gray-200/50 rounded-lg">
                    <button
                      onClick={() => setBuilderType("singles")}
                      className={`flex-1 py-1 text-xs font-bold rounded transition-colors ${builderType === "singles" ? "bg-white text-indigo-700 shadow-sm" : "text-gray-500"}`}
                    >
                      Singles
                    </button>
                    <button
                      onClick={() => setBuilderType("doubles")}
                      className={`flex-1 py-1 text-xs font-bold rounded transition-colors ${builderType === "doubles" ? "bg-white text-indigo-700 shadow-sm" : "text-gray-500"}`}
                    >
                      Doubles
                    </button>
                  </div>
                  <div className="relative">
                    <Search
                      size={14}
                      className="absolute left-3 top-2.5 text-gray-400"
                    />
                    <input
                      type="text"
                      placeholder="Search roster..."
                      value={rosterSearch}
                      onChange={(e) => setRosterSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {filteredRoster.map((player) => {
                    const matchCount = matches.filter(
                      (m) =>
                        m.type === builderType &&
                        (m.teamA.includes(player.id) ||
                          m.teamB.includes(player.id)),
                    ).length;

                    let bgStyle =
                      "bg-white border-gray-100 hover:border-indigo-300";
                    let statusDot = null;

                    if (matchCount === 1) {
                      bgStyle =
                        "bg-yellow-50 border-yellow-200 hover:border-yellow-400";
                      statusDot = (
                        <span
                          className="w-2 h-2 rounded-full bg-yellow-400"
                          title="1 Match Scheduled"
                        ></span>
                      );
                    } else if (matchCount >= 2) {
                      bgStyle =
                        "bg-emerald-50 border-emerald-200 hover:border-emerald-400";
                      statusDot = (
                        <span
                          className="w-2 h-2 rounded-full bg-emerald-500"
                          title="2+ Matches Scheduled"
                        ></span>
                      );
                    }

                    return (
                      <div
                        key={player.id}
                        draggable
                        onDragStart={(e) => handlePlayerDragStart(e, player.id)}
                        className={`${bgStyle} border-2 p-3 rounded-xl cursor-grab active:cursor-grabbing flex items-center justify-between shadow-sm hover:shadow group transition-all`}
                      >
                        <div className="flex items-center gap-3">
                          {statusDot}
                          <div>
                            <div className="font-bold text-gray-800 text-sm">
                              {player.name}
                            </div>
                            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                              {player.category}
                            </div>
                          </div>
                        </div>
                        <GripVertical
                          size={16}
                          className="text-gray-300 group-hover:text-indigo-400"
                        />
                      </div>
                    );
                  })}
                  {filteredRoster.length === 0 && (
                    <div className="text-center p-4 text-xs font-medium text-gray-400">
                      No players found matching this type.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT AREA: THE INFINITE TIMELINE BOARD */}
            <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
              <div className="bg-gray-50 border-b border-gray-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-black text-gray-800 text-lg flex items-center gap-2">
                    <Clock size={20} className="text-indigo-600" /> Schedule
                    Canvas
                  </h3>
                </div>
                <select
                  value={builderDate}
                  onChange={(e) => setBuilderDate(e.target.value)}
                  className="border-2 border-indigo-100 text-indigo-900 bg-indigo-50 p-2 rounded-lg text-sm font-bold outline-none cursor-pointer focus:border-indigo-300"
                >
                  <option value="" disabled>
                    Select Date
                  </option>
                  {tournamentDays.map((day) => (
                    <option key={day.date} value={day.date}>
                      {formatDisplayDate(day.date)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-4 md:p-6 space-y-8 max-h-[calc(100vh-8rem)] overflow-y-auto bg-slate-50/50">
                {builderTimeSlots.length === 0 ? (
                  <div className="text-center text-gray-500 py-10">
                    No time slots generated for this date. Check tournament
                    settings.
                  </div>
                ) : (
                  builderTimeSlots.map((timeSlotStr) => {
                    const matchesInSlot = enrichedMatchesList
                      .filter(
                        (m) =>
                          m.timeSlot === timeSlotStr && m.type === builderType,
                      )
                      .sort((a, b) => {
                        if (a.order !== undefined && b.order !== undefined)
                          return a.order - b.order;
                        return (
                          new Date(a.createdAt || a.updatedAt || 0) -
                          new Date(b.createdAt || b.updatedAt || 0)
                        );
                      });

                    const renderSlots = [...matchesInSlot, null];
                    const maxPlayersPerTeam = builderType === "singles" ? 1 : 2;

                    return (
                      <div
                        key={timeSlotStr}
                        className="bg-white border border-gray-200 shadow-sm rounded-xl p-4 flex flex-col relative mb-6"
                      >
                        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-indigo-500 rounded-l-xl"></div>

                        <div className="flex items-center gap-2 mb-4 pl-2 border-b border-gray-100 pb-2">
                          <Clock size={16} className="text-gray-400" />
                          <h4 className="font-bold text-gray-800 text-sm">
                            {formatStartTime(timeSlotStr)} Block
                          </h4>
                          <span className="text-[10px] font-semibold text-gray-500 ml-2 bg-gray-100 px-2 py-0.5 rounded">
                            {timeSlotStr.includes("TBD")
                              ? "Holding Area"
                              : timeSlotStr}
                          </span>
                        </div>

                        <div className="space-y-4 pl-2">
                          {renderSlots.map((matchInSlot, mIndex) => {
                            const isNewDropzone = matchInSlot === null;

                            return (
                              <div
                                key={
                                  isNewDropzone
                                    ? `new-${mIndex}`
                                    : matchInSlot.id
                                }
                                className={`flex flex-col md:flex-row gap-4 md:items-center p-3 rounded-lg border-2 ${isNewDropzone ? "bg-gray-50/50 border-dashed border-gray-200" : "bg-white border-solid border-gray-100 shadow-sm"}`}
                              >
                                <div className="w-16 flex flex-col justify-center text-center shrink-0">
                                  <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                    {isNewDropzone ? "New" : "Match"}
                                  </div>
                                  {!isNewDropzone && (
                                    <>
                                      <div className="font-black text-indigo-900 text-lg leading-tight">
                                        #{mIndex + 1}
                                      </div>
                                      {!timeSlotStr.includes("TBD") && (
                                        <div className="text-[10px] font-bold text-indigo-600 mt-1">
                                          {calculatePreciseTime(
                                            timeSlotStr,
                                            mIndex,
                                          )}
                                        </div>
                                      )}
                                    </>
                                  )}

                                  {/* --- UP/DOWN SEQUENCE ARROWS --- */}
                                  {!isNewDropzone &&
                                    !timeSlotStr.includes("TBD") && (
                                      <div className="flex justify-center gap-1 mt-2">
                                        <button
                                          onClick={() =>
                                            handleMoveMatchSequence(
                                              matchInSlot,
                                              -1,
                                            )
                                          }
                                          disabled={mIndex === 0}
                                          className="text-gray-300 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                          title="Move Match Up"
                                        >
                                          <ArrowUp size={16} />
                                        </button>
                                        <button
                                          onClick={() =>
                                            handleMoveMatchSequence(
                                              matchInSlot,
                                              1,
                                            )
                                          }
                                          disabled={
                                            mIndex === matchesInSlot.length - 1
                                          }
                                          className="text-gray-300 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                          title="Move Match Down"
                                        >
                                          <ArrowDown size={16} />
                                        </button>
                                      </div>
                                    )}

                                  {/* --- MASS MOVE DROPDOWN & EDIT --- */}
                                  {!isNewDropzone && (
                                    <div className="flex flex-col gap-1 mt-2 w-full">
                                      {tournamentDays.length > 1 && (
                                        <select
                                          value=""
                                          onChange={(e) =>
                                            handleMoveToDate(
                                              matchInSlot,
                                              e.target.value,
                                            )
                                          }
                                          className="w-full text-[9px] font-bold uppercase text-indigo-600 bg-indigo-50 border border-indigo-100 rounded px-1 py-1 outline-none cursor-pointer text-center appearance-none"
                                          title="Move match to a different date"
                                        >
                                          <option value="" disabled>
                                            Move ➔
                                          </option>
                                          {tournamentDays
                                            .filter(
                                              (d) => d.date !== builderDate,
                                            )
                                            .map((day) => (
                                              <option
                                                key={day.date}
                                                value={day.date}
                                              >
                                                To {formatDisplayDate(day.date)}
                                              </option>
                                            ))}
                                        </select>
                                      )}
                                      <button
                                        onClick={() =>
                                          openEditModal(matchInSlot)
                                        }
                                        className="flex items-center justify-center gap-1 w-full text-[9px] font-bold uppercase text-gray-500 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded py-1 transition-colors"
                                      >
                                        <Edit2 size={10} /> Edit
                                      </button>
                                    </div>
                                  )}

                                  {isNewDropzone && (
                                    <div className="text-gray-300 mt-1">
                                      <Plus size={20} className="mx-auto" />
                                    </div>
                                  )}
                                </div>

                                <div className="flex-1 flex flex-col md:flex-row items-center gap-4 w-full">
                                  {/* TEAM A DROPZONE */}
                                  <div className="flex-1 w-full bg-blue-50/50 border border-blue-100 rounded-lg p-3">
                                    <div className="text-[10px] font-black text-blue-800 uppercase tracking-wider mb-2">
                                      Team 1
                                    </div>
                                    <div className="space-y-2">
                                      {Array.from({
                                        length: maxPlayersPerTeam,
                                      }).map((_, idx) => {
                                        const playerId =
                                          matchInSlot?.teamA?.[idx];
                                        return (
                                          <div
                                            key={`A-${idx}`}
                                            onDragOver={(e) =>
                                              e.preventDefault()
                                            }
                                            onDrop={(e) =>
                                              handlePlayerDrop(
                                                e,
                                                timeSlotStr,
                                                "teamA",
                                                idx,
                                                matchInSlot?.id,
                                              )
                                            }
                                            className={`w-full p-3 rounded-lg border-2 transition-all flex justify-between items-center ${
                                              playerId
                                                ? "bg-white border-blue-200 shadow-sm"
                                                : "bg-blue-50/50 border-dashed border-blue-200 text-blue-400 hover:bg-blue-100/50"
                                            }`}
                                          >
                                            {playerId ? (
                                              <>
                                                <span className="flex items-center gap-1.5 overflow-hidden">
                                                  <span
                                                    className={`w-2 h-2 rounded-full shrink-0 ${
                                                      matchInSlot?.rsvps?.[
                                                        playerId
                                                      ] === "available"
                                                        ? "bg-emerald-500"
                                                        : matchInSlot?.rsvps?.[
                                                              playerId
                                                            ] === "unavailable"
                                                          ? "bg-red-500"
                                                          : "bg-yellow-400"
                                                    }`}
                                                    title={
                                                      matchInSlot?.rsvps?.[
                                                        playerId
                                                      ] || "Pending"
                                                    }
                                                  ></span>
                                                  <span className="font-bold text-sm text-gray-800 truncate">
                                                    {getPlayerName(playerId)}
                                                  </span>
                                                </span>
                                                <button
                                                  onClick={() =>
                                                    handleRemovePlayerFromSlot(
                                                      matchInSlot.id,
                                                      "teamA",
                                                      idx,
                                                    )
                                                  }
                                                  className="text-gray-400 hover:text-red-500 transition-colors"
                                                >
                                                  <UserX size={14} />
                                                </button>
                                              </>
                                            ) : (
                                              <span className="text-xs font-bold uppercase tracking-wider mx-auto">
                                                Drop Player Here
                                              </span>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>

                                  <div className="text-[10px] font-black text-gray-400 uppercase">
                                    VS
                                  </div>

                                  {/* TEAM B DROPZONE */}
                                  <div className="flex-1 w-full bg-red-50/50 border border-red-100 rounded-lg p-3">
                                    <div className="text-[10px] font-black text-red-800 uppercase tracking-wider mb-2">
                                      Team 2
                                    </div>
                                    <div className="space-y-2">
                                      {Array.from({
                                        length: maxPlayersPerTeam,
                                      }).map((_, idx) => {
                                        const playerId =
                                          matchInSlot?.teamB?.[idx];
                                        return (
                                          <div
                                            key={`B-${idx}`}
                                            onDragOver={(e) =>
                                              e.preventDefault()
                                            }
                                            onDrop={(e) =>
                                              handlePlayerDrop(
                                                e,
                                                timeSlotStr,
                                                "teamB",
                                                idx,
                                                matchInSlot?.id,
                                              )
                                            }
                                            className={`w-full p-3 rounded-lg border-2 transition-all flex justify-between items-center ${
                                              playerId
                                                ? "bg-white border-red-200 shadow-sm"
                                                : "bg-red-50/50 border-dashed border-red-200 text-red-400 hover:bg-red-100/50"
                                            }`}
                                          >
                                            {playerId ? (
                                              <>
                                                <span className="flex items-center gap-1.5 overflow-hidden">
                                                  <span
                                                    className={`w-2 h-2 rounded-full shrink-0 ${
                                                      matchInSlot?.rsvps?.[
                                                        playerId
                                                      ] === "available"
                                                        ? "bg-emerald-500"
                                                        : matchInSlot?.rsvps?.[
                                                              playerId
                                                            ] === "unavailable"
                                                          ? "bg-red-500"
                                                          : "bg-yellow-400"
                                                    }`}
                                                    title={
                                                      matchInSlot?.rsvps?.[
                                                        playerId
                                                      ] || "Pending"
                                                    }
                                                  ></span>
                                                  <span className="font-bold text-sm text-gray-800 truncate">
                                                    {getPlayerName(playerId)}
                                                  </span>
                                                </span>
                                                <button
                                                  onClick={() =>
                                                    handleRemovePlayerFromSlot(
                                                      matchInSlot.id,
                                                      "teamB",
                                                      idx,
                                                    )
                                                  }
                                                  className="text-gray-400 hover:text-red-500 transition-colors"
                                                >
                                                  <UserX size={14} />
                                                </button>
                                              </>
                                            ) : (
                                              <span className="text-xs font-bold uppercase tracking-wider mx-auto">
                                                Drop Player Here
                                              </span>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
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

              <div className="mb-6">
                <label className="block text-sm font-medium mb-1 text-gray-700">
                  Walkover / Remarks (Optional)
                </label>
                <select
                  value={formData.walkover || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, walkover: e.target.value })
                  }
                  className="w-full border p-2 rounded outline-none bg-white text-sm"
                >
                  <option value="">None (Match played normally)</option>
                  <option value="A">Team A Won (Team B Absent)</option>
                  <option value="B">Team B Won (Team A Absent)</option>
                  <option value="both">Void (Both Absent)</option>
                </select>
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
