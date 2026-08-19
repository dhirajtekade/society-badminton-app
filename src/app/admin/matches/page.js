"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, setDoc, addDoc, writeBatch, getDoc } from "firebase/firestore";
import { Plus, Edit2, Clock, MapPin, Zap, AlertTriangle, Settings2, X } from "lucide-react";

export default function AdminMatchesPage() {
  const [matches, setMatches] = useState([]);
  const [playersList, setPlayersList] = useState([]);
  const [players, setPlayers] = useState({});
  const [tournamentDays, setTournamentDays] = useState([]);
  const [playerCategories, setPlayerCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Modals State
  const [isMatchModalOpen, setIsMatchModalOpen] = useState(false);
  const [isGenModalOpen, setIsGenModalOpen] = useState(false);
  const [editingMatchId, setEditingMatchId] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Manual Match Form State
  const [formData, setFormData] = useState({
    type: "singles", 
    stage: "League", 
    teamA: [""], 
    teamB: [""],
    court: "Court 1",
    timeSlot: "",
    status: "scheduled"
  });

  // Smart Generator Form State
  const [genData, setGenData] = useState({
    type: "singles",
    priority1: "cat_same",
    priority2: "avail_strict",
    priority3: "none"
  });

  // Fetch data on load
  useEffect(() => {
    const fetchData = async () => {
      try {
        // 1. Fetch Tournament Settings (for time slots and categories)
        const settingsSnap = await getDoc(doc(db, "settings", "tournament"));
        if (settingsSnap.exists()) {
          const data = settingsSnap.data();
          if (data.tournamentDays) setTournamentDays(data.tournamentDays);
          if (data.playerCategories) setPlayerCategories(data.playerCategories);
        }

        // 2. Fetch Players
        const playersSnap = await getDocs(collection(db, "players"));
        const playersDict = {};
        const pList = [];
        playersSnap.forEach((doc) => {
          playersDict[doc.id] = doc.data().name;
          pList.push({ id: doc.id, ...doc.data() });
        });
        setPlayers(playersDict);
        setPlayersList(pList);

        // 3. Fetch Matches
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
    const options = { weekday: 'short', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('en-IN', options);
  };

  // --- SMART MULTI-PRIORITY ALGORITHM ---
  const executeSmartGeneration = async (e) => {
    e.preventDefault();
    setIsGenerating(true);

    try {
      const batch = writeBatch(db);
      const generatedMatches = [];
      
      // Determine rules from priorities
      const allPriorities = [genData.priority1, genData.priority2, genData.priority3];
      const rules = {
        sameCategory: allPriorities.includes("cat_same"),
        crossCategory: allPriorities.includes("cat_cross"),
        checkAvail: allPriorities.includes("avail_strict") || allPriorities.includes("avail_loose"),
        strictAvail: allPriorities.includes("avail_strict")
      };

      // Filter to active players for this type
      const activePlayers = playersList.filter(p => genData.type === "singles" ? p.playsSingles : p.playsDoubles);
      const pairs = [];

      // RULE: Determine Matchups
      if (rules.sameCategory) {
        // Group by custom category and Round-Robin within them
        playerCategories.forEach(cat => {
          const catPlayers = activePlayers.filter(p => p.category === cat.name);
          for (let i = 0; i < catPlayers.length; i++) {
            for (let j = i + 1; j < catPlayers.length; j++) {
              pairs.push({ p1: catPlayers[i], p2: catPlayers[j], stage: `League: ${cat.name}` });
            }
          }
        });
      } else if (rules.crossCategory) {
        // Match players ONLY against people NOT in their category
        for (let i = 0; i < activePlayers.length; i++) {
          for (let j = i + 1; j < activePlayers.length; j++) {
            if (activePlayers[i].category !== activePlayers[j].category) {
              pairs.push({ p1: activePlayers[i], p2: activePlayers[j], stage: 'Cross-Category Mix' });
            }
          }
        }
      } else {
        // Total Random Round Robin (Everyone vs Everyone)
        for (let i = 0; i < activePlayers.length; i++) {
          for (let j = i + 1; j < activePlayers.length; j++) {
            pairs.push({ p1: activePlayers[i], p2: activePlayers[j], stage: 'General League' });
          }
        }
      }

      // Track court availability to limit to 2 matches per time slot
      const slotTracker = {};
      tournamentDays.forEach(day => {
        day.slots.forEach(slot => {
          slotTracker[slot.id] = { label: `${formatDisplayDate(day.date)} | ${slot.label}`, assignedCourts: 0 };
        });
      });

      // RULE: Schedule Matches
      pairs.forEach(pair => {
        let finalTimeSlot = "TBD - Unschedulable";
        let finalCourt = "TBD";
        let status = "conflict";
        let scheduleSuccess = false;

        if (rules.checkAvail) {
          const p1Avail = pair.p1.availability || [];
          const p2Avail = pair.p2.availability || [];
          const commonSlots = p1Avail.filter(slotId => p2Avail.includes(slotId));

          if (commonSlots.length > 0) {
            for (const slotId of commonSlots) {
              if (slotTracker[slotId] && slotTracker[slotId].assignedCourts < 2) {
                slotTracker[slotId].assignedCourts += 1;
                finalCourt = "Court " + slotTracker[slotId].assignedCourts;
                finalTimeSlot = slotTracker[slotId].label;
                status = "scheduled";
                scheduleSuccess = true;
                break; 
              }
            }
            if (!scheduleSuccess) finalTimeSlot = "TBD - Courts Full at Common Times";
          } else {
            finalTimeSlot = "TBD - No Overlapping Availability";
          }
        }

        // If strict availability is on, and we couldn't schedule it, SKIP creating the match
        if (rules.strictAvail && !scheduleSuccess) {
          return; // Skip this match entirely
        }

        // Build the Firestore Object
        const matchData = {
          type: genData.type,
          stage: pair.stage,
          teamA: [pair.p1.id],
          teamB: [pair.p2.id],
          court: finalCourt,
          timeSlot: finalTimeSlot,
          status: status,
          updatedAt: new Date().toISOString()
        };

        const docRef = doc(collection(db, "matches"));
        batch.set(docRef, matchData);
        generatedMatches.push({ id: docRef.id, ...matchData });
      });

      await batch.commit();
      setMatches(prev => [...generatedMatches, ...prev]);
      
      const conflicts = generatedMatches.filter(m => m.status === "conflict").length;
      alert(`Generated ${generatedMatches.length} matches! ${conflicts > 0 ? `\n\nWarning: ${conflicts} matches have schedule conflicts (Marked as TBD).` : ''}`);
      setIsGenModalOpen(false);
    } catch (error) {
      console.error("Error generating matches:", error);
      alert("Failed to auto-generate matches.");
    } finally {
      setIsGenerating(false);
    }
  };

  // --- MANUAL MATCH LOGIC ---
  const openNewMatchModal = () => {
    setEditingMatchId(null);
    setFormData({ type: "singles", stage: "League", teamA: [""], teamB: [""], court: "Court 1", timeSlot: "", status: "scheduled" });
    setIsMatchModalOpen(true);
  };

  const openEditModal = (match) => {
    setEditingMatchId(match.id);
    setFormData({
      type: match.type || "singles", stage: match.stage || "League", teamA: [...match.teamA], teamB: [...match.teamB], 
      court: match.court || "Court 1", timeSlot: match.timeSlot || "", status: match.status || "scheduled"
    });
    setIsMatchModalOpen(true);
  };

  const handleSaveMatch = async (e) => {
    e.preventDefault();
    const cleanTeamA = formData.teamA.filter(id => id.trim() !== "");
    const cleanTeamB = formData.teamB.filter(id => id.trim() !== "");

    let newStatus = formData.status;
    if (formData.timeSlot && !formData.timeSlot.includes("TBD")) newStatus = "scheduled";

    const matchData = { ...formData, teamA: cleanTeamA, teamB: cleanTeamB, status: newStatus, updatedAt: new Date().toISOString() };

    try {
      if (editingMatchId) {
        await setDoc(doc(db, "matches", editingMatchId), matchData, { merge: true });
        setMatches(prev => prev.map(m => m.id === editingMatchId ? { id: editingMatchId, ...matchData } : m));
      } else {
        const docRef = await addDoc(collection(db, "matches"), matchData);
        setMatches(prev => [{ id: docRef.id, ...matchData }, ...prev]);
      }
      setIsMatchModalOpen(false);
    } catch (error) {
      console.error("Error saving match:", error);
    }
  };

  const getPlayerName = (id) => players[id] || id || "TBD";
  const availableTimeSlots = tournamentDays.flatMap(day => day.slots.map(slot => `${formatDisplayDate(day.date)} | ${slot.label}`));

  // Generation Dropdown Options
  const ruleOptions = [
    { value: "none", label: "-- Ignore / Not Required --" },
    { value: "cat_same", label: "Group by Category (Play within own tag)" },
    { value: "cat_cross", label: "Cross-Category (Play outside own tag)" },
    { value: "avail_strict", label: "Strict Availability (Skip if no overlap)" },
    { value: "avail_loose", label: "Loose Availability (Create as TBD if no overlap)" }
  ];

  return (
    <>
      <div className="max-w-7xl mx-auto p-6 mt-10">
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Match Schedule & Editor</h1>
            <p className="text-gray-500 mt-1">Manage fixtures and resolve availability conflicts.</p>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={() => setIsGenModalOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded flex items-center gap-2 transition-colors shadow-sm"
            >
              <Settings2 size={18} /> Smart-Gen Matches
            </button>
            <button 
              onClick={openNewMatchModal}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded flex items-center gap-2 shadow-sm"
            >
              <Plus size={18} /> Manual Match
            </button>
          </div>
        </div>

        {/* Match List */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {isLoading ? (
            <p className="col-span-full text-gray-500">Loading match data...</p>
          ) : matches.length === 0 ? (
            <p className="col-span-full text-center p-12 bg-white rounded-lg border border-dashed text-gray-500">No matches scheduled yet. Use Smart-Gen to begin.</p>
          ) : (
            matches.map((match) => (
              <div key={match.id} className={`bg-white rounded-lg shadow-sm border p-5 relative transition-all ${match.status === 'conflict' ? 'border-red-400 bg-red-50/30' : 'border-gray-200'}`}>
                <div className="flex justify-between items-start mb-4 border-b pb-3">
                  <div>
                    <span className={`text-xs font-bold uppercase tracking-wider px-2 py-1 rounded ${match.status === 'conflict' ? 'bg-red-100 text-red-800' : 'bg-blue-50 text-blue-600'}`}>
                      {match.stage} • {match.type}
                    </span>
                  </div>
                  <button onClick={() => openEditModal(match)} className="text-gray-400 hover:text-blue-600 transition-colors">
                    <Edit2 size={18} />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-gray-500">Team 1</span>
                    {match.teamA.map((id, idx) => (
                      <span key={idx} className="font-medium text-gray-900 truncate">{getPlayerName(id)}</span>
                    ))}
                  </div>
                  
                  <div className="text-center font-bold text-gray-300 text-sm">VS</div>

                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-gray-500">Team 2</span>
                    {match.teamB.map((id, idx) => (
                      <span key={idx} className="font-medium text-gray-900 truncate">{getPlayerName(id)}</span>
                    ))}
                  </div>
                </div>

                <div className={`mt-5 flex flex-col gap-2 text-xs font-medium p-2 rounded ${match.status === 'conflict' ? 'bg-red-100/50 text-red-700' : 'bg-gray-50 text-gray-600'}`}>
                  {match.status === 'conflict' && (
                    <div className="flex items-center gap-1 font-bold"><AlertTriangle size={14}/> Conflict Detected</div>
                  )}
                  <div className="flex items-center gap-1"><Clock size={14} /> {match.timeSlot || "TBD"}</div>
                  <div className="flex items-center gap-1"><MapPin size={14} /> {match.court || "TBD"}</div>
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
                <h2 className="text-xl font-bold flex items-center gap-2"><Zap size={20}/> Matchmaking Engine</h2>
                <p className="text-indigo-100 text-sm">Define rules to automatically pair players.</p>
              </div>
              <button onClick={() => setIsGenModalOpen(false)} className="text-indigo-200 hover:text-white transition-colors"><X size={24}/></button>
            </div>
            
            <form onSubmit={executeSmartGeneration} className="p-6">
              <div className="mb-6">
                <label className="block text-sm font-bold text-gray-700 mb-2">Tournament Type</label>
                <select value={genData.type} onChange={e => setGenData({...genData, type: e.target.value})} className="w-full border p-3 rounded bg-gray-50 outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="singles">Singles (1v1)</option>
                  <option value="doubles">Doubles (2v2 - Requires Pre-assigned Partners)</option>
                </select>
              </div>

              <div className="space-y-4 mb-8 p-5 bg-gray-50 rounded-lg border border-gray-200">
                <h3 className="font-bold text-gray-800 border-b pb-2">Rule Hierarchy</h3>
                
                <div>
                  <label className="block text-xs font-bold text-indigo-600 uppercase mb-1">Priority 1 (Primary Logic)</label>
                  <select value={genData.priority1} onChange={e => setGenData({...genData, priority1: e.target.value})} className="w-full border p-2.5 rounded outline-none focus:border-indigo-500 shadow-sm bg-white">
                    {ruleOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-indigo-600 uppercase mb-1">Priority 2 (Secondary Logic)</label>
                  <select value={genData.priority2} onChange={e => setGenData({...genData, priority2: e.target.value})} className="w-full border p-2.5 rounded outline-none focus:border-indigo-500 shadow-sm bg-white">
                    {ruleOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Priority 3 (Fallback Logic)</label>
                  <select value={genData.priority3} onChange={e => setGenData({...genData, priority3: e.target.value})} className="w-full border p-2.5 rounded outline-none focus:border-gray-500 shadow-sm bg-white">
                    {ruleOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex gap-3">
                <button type="button" onClick={() => setIsGenModalOpen(false)} className="flex-1 px-4 py-3 border text-gray-700 font-bold rounded-lg hover:bg-gray-100 transition-colors">Cancel</button>
                <button type="submit" disabled={isGenerating} className="flex-1 px-4 py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex justify-center items-center gap-2">
                  {isGenerating ? "Executing..." : <><Zap size={18} /> Execute Setup</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MANUAL EDITOR MODAL (Existing logic maintained) --- */}
      {isMatchModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[9999] overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mt-10 mb-10">
            {/* Same manual editor form as before... */}
            <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold">The Chaos Editor</h2>
                <p className="text-xs text-gray-500">Use MHT IDs to assign players.</p>
              </div>
              {formData.status === 'conflict' && <span className="bg-red-100 text-red-800 text-xs font-bold px-2 py-1 rounded border border-red-200">Needs Resolution</span>}
            </div>
            
            <form onSubmit={handleSaveMatch} className="p-6">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium mb-1">Match Type</label>
                  <select value={formData.type} onChange={e => { const newType = e.target.value; setFormData({...formData, type: newType, teamA: newType === 'singles' ? [formData.teamA[0] || ""] : [formData.teamA[0] || "", formData.teamA[1] || ""], teamB: newType === 'singles' ? [formData.teamB[0] || ""] : [formData.teamB[0] || "", formData.teamB[1] || ""]}); }} className="w-full border p-2 rounded outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="singles">Singles</option>
                    <option value="doubles">Doubles</option>
                  </select>
                </div>
                <div><label className="block text-sm font-medium mb-1">Stage</label><input type="text" value={formData.stage} onChange={e => setFormData({...formData, stage: e.target.value})} className="w-full border p-2 rounded outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. Quarter Final" /></div>
              </div>

              <div className="grid grid-cols-2 gap-8 mb-6 bg-gray-50 p-4 rounded border">
                <div>
                  <label className="block font-bold mb-2 text-blue-700">Team 1 (MHT IDs)</label>
                  {formData.teamA.map((id, index) => (
                    <div key={index} className="mb-2">
                      <input type="text" value={id} onChange={(e) => { const newTeam = [...formData.teamA]; newTeam[index] = e.target.value; setFormData({...formData, teamA: newTeam}); }} className="w-full border p-2 rounded mb-1 outline-none focus:ring-2 focus:ring-blue-500" placeholder={`Player ${index + 1} ID`} />
                      <span className="text-xs text-gray-500 block truncate">Name: {players[id] || "Unknown ID"}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <label className="block font-bold mb-2 text-red-700">Team 2 (MHT IDs)</label>
                  {formData.teamB.map((id, index) => (
                    <div key={index} className="mb-2">
                      <input type="text" value={id} onChange={(e) => { const newTeam = [...formData.teamB]; newTeam[index] = e.target.value; setFormData({...formData, teamB: newTeam}); }} className="w-full border p-2 rounded mb-1 outline-none focus:ring-2 focus:ring-blue-500" placeholder={`Player ${index + 1} ID`} />
                      <span className="text-xs text-gray-500 block truncate">Name: {players[id] || "Unknown ID"}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium mb-1">Time Slot</label>
                  <select value={formData.timeSlot} onChange={e => setFormData({...formData, timeSlot: e.target.value})} className={`w-full border p-2 rounded outline-none focus:ring-2 focus:ring-blue-500 ${formData.timeSlot.includes('TBD') ? 'border-red-400 bg-red-50 text-red-700' : ''}`}>
                    <option value="">Select a time slot...</option>
                    {formData.timeSlot.includes('TBD') && <option value={formData.timeSlot}>{formData.timeSlot}</option>}
                    {availableTimeSlots.map((slotStr, i) => <option key={i} value={slotStr}>{slotStr}</option>)}
                    <option value="Custom">Custom / Manual Override</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Court</label>
                  <select value={formData.court} onChange={e => setFormData({...formData, court: e.target.value})} className="w-full border p-2 rounded outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="Court 1">Court 1</option>
                    <option value="Court 2">Court 2</option>
                    <option value="TBD">TBD</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setIsMatchModalOpen(false)} className="px-4 py-2 border rounded hover:bg-gray-100">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Save Match</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}