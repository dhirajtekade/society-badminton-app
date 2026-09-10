"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import {
  Plus,
  Trash2,
  Save,
  Calendar as CalendarIcon,
  Clock,
  AlertCircle,
  Tags,
  Tag,
  Timer,
  X,
} from "lucide-react";

export default function AdminSettingsPage() {
  const [tournamentDays, setTournamentDays] = useState([]);
  const [playerCategories, setPlayerCategories] = useState([]);
  // TIMING STATES
  const [matchDuration, setMatchDuration] = useState(10);
  const [bufferTime, setBufferTime] = useState(5);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState({ message: "", type: "" });

  const [newDate, setNewDate] = useState("");
  const [startTime, setStartTime] = useState("20:00");
  const [endTime, setEndTime] = useState("23:00");
  const [newCategory, setNewCategory] = useState("");

  useEffect(() => {
    const today = new Date();
    const offset = today.getTimezoneOffset();
    const localDate = new Date(today.getTime() - offset * 60 * 1000)
      .toISOString()
      .split("T")[0];
    setNewDate(localDate);

    const fetchSettings = async () => {
      try {
        const docRef = doc(db, "settings", "tournament");
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.tournamentDays) setTournamentDays(data.tournamentDays);
          if (data.playerCategories) setPlayerCategories(data.playerCategories);
          if (data.matchDuration) setMatchDuration(data.matchDuration);
          if (data.bufferTime) setBufferTime(data.bufferTime);
        }
      } catch (error) {
        console.error("Error fetching settings:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const handleAddCategory = (e) => {
    e.preventDefault();
    const cleanCategory = newCategory.trim();
    if (!cleanCategory) return;

    const exists = playerCategories.some(
      (c) => c.name.toLowerCase() === cleanCategory.toLowerCase(),
    );
    if (exists) {
      setStatus({ message: "That category already exists.", type: "error" });
      setTimeout(() => setStatus({ message: "", type: "" }), 3000);
      return;
    }

    const newCat = { id: Date.now().toString(), name: cleanCategory };
    setPlayerCategories([...playerCategories, newCat]);
    setNewCategory("");
    setStatus({
      message: "Unsaved changes. Don't forget to save!",
      type: "warning",
    });
  };

  const handleRemoveCategory = (idToRemove) => {
    setPlayerCategories(playerCategories.filter((c) => c.id !== idToRemove));
    setStatus({
      message: "Unsaved changes. Don't forget to save!",
      type: "warning",
    });
  };

  const formatTime12h = (time24) => {
    if (!time24) return "";
    const [h, m] = time24.split(":");
    const hours = parseInt(h, 10);
    const suffix = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${m} ${suffix}`;
  };

  // --- NEW: SMART SLOT GENERATOR ---
  const handleAddSlot = (e) => {
    e.preventDefault();
    if (!newDate || !startTime || !endTime) return;

    const [startH, startM] = startTime.split(":").map(Number);
    const [endH, endM] = endTime.split(":").map(Number);

    let currentTotalMins = startH * 60 + startM;
    const endTotalMins = endH * 60 + endM;

    if (currentTotalMins >= endTotalMins) {
      setStatus({
        message: "Start time must be before end time.",
        type: "error",
      });
      setTimeout(() => setStatus({ message: "", type: "" }), 3000);
      return;
    }

    const mDur = parseInt(matchDuration, 10) || 10;
    const bTime = parseInt(bufferTime, 10) || 5;
    const totalSlotTime = mDur + bTime;

    const generatedSlots = [];
    let index = 0;

    // Loop through the block and generate specific times based on settings
    while (currentTotalMins + mDur <= endTotalMins) {
      const h = Math.floor(currentTotalMins / 60);
      const m = currentTotalMins % 60;
      const startStr = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;

      // Calculate end time to maintain backwards compatibility with Smart Generator
      const endMins = currentTotalMins + mDur;
      const eh = Math.floor(endMins / 60);
      const em = endMins % 60;
      const endStr = `${eh.toString().padStart(2, "0")}:${em.toString().padStart(2, "0")}`;

      generatedSlots.push({
        id: Date.now().toString() + "-" + index,
        startTime: startStr,
        endTime: endStr,
        label: formatTime12h(startStr), // e.g., "8:00 PM"
      });

      currentTotalMins += totalSlotTime;
      index++;
    }

    if (generatedSlots.length === 0) {
      setStatus({
        message: "Time block is too short for a single match duration.",
        type: "error",
      });
      setTimeout(() => setStatus({ message: "", type: "" }), 3000);
      return;
    }

    const existingDayIndex = tournamentDays.findIndex(
      (d) => d.date === newDate,
    );
    let updatedDays = [...tournamentDays];

    if (existingDayIndex >= 0) {
      updatedDays[existingDayIndex].slots.push(...generatedSlots);
      // Sort chronologically
      updatedDays[existingDayIndex].slots.sort((a, b) =>
        a.startTime.localeCompare(b.startTime),
      );
    } else {
      updatedDays.push({ date: newDate, slots: generatedSlots });
      updatedDays.sort((a, b) => new Date(a.date) - new Date(b.date));
    }

    setTournamentDays(updatedDays);
    setStartTime("20:00");
    setEndTime("23:00");
    setStatus({
      message: `Generated ${generatedSlots.length} match slots. Don't forget to save!`,
      type: "warning",
    });
  };

  const handleRemoveSlot = (dateString, slotId) => {
    const updatedDays = tournamentDays
      .map((day) => {
        if (day.date === dateString) {
          return { ...day, slots: day.slots.filter((s) => s.id !== slotId) };
        }
        return day;
      })
      .filter((day) => day.slots.length > 0);

    setTournamentDays(updatedDays);
    setStatus({
      message: "Unsaved changes. Don't forget to save!",
      type: "warning",
    });
  };

  const handleRemoveDay = (dateString) => {
    if (!confirm("Are you sure you want to clear all slots for this day?"))
      return;
    setTournamentDays(tournamentDays.filter((d) => d.date !== dateString));
    setStatus({
      message: "Unsaved changes. Don't forget to save!",
      type: "warning",
    });
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    setStatus({ message: "Saving...", type: "info" });

    try {
      const docRef = doc(db, "settings", "tournament");
      const sortedDays = [...tournamentDays].sort(
        (a, b) => new Date(a.date) - new Date(b.date),
      );

      await setDoc(
        docRef,
        {
          tournamentDays: sortedDays,
          playerCategories: playerCategories,
          matchDuration: parseInt(matchDuration, 10) || 10,
          bufferTime: parseInt(bufferTime, 10) || 5,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );

      setTournamentDays(sortedDays);
      setStatus({ message: "Settings saved successfully!", type: "success" });
      setTimeout(() => setStatus({ message: "", type: "" }), 3000);
    } catch (error) {
      console.error("Error saving settings:", error);
      setStatus({ message: "Failed to save settings.", type: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  const formatDisplayDate = (dateString) => {
    const options = { weekday: "long", month: "short", day: "numeric" };
    return new Date(dateString).toLocaleDateString("en-IN", options);
  };

  return (
    <div className="max-w-5xl mx-auto p-6 mt-10 mb-20 animate-in fade-in">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">
            Tournament Settings
          </h1>
          <p className="text-gray-500 mt-1">
            Configure global rules, timing, and exact availability slots.
          </p>
        </div>

        <button
          onClick={handleSaveSettings}
          disabled={isSaving}
          className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-6 rounded flex items-center gap-2 transition-colors disabled:opacity-50 shadow-sm"
        >
          <Save size={18} />
          {isSaving ? "Saving..." : "Save Settings"}
        </button>
      </div>

      {status.message && (
        <div
          className={`mb-6 p-4 rounded flex items-center gap-2 font-medium ${
            status.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : status.type === "warning"
                ? "bg-yellow-50 text-yellow-700 border border-yellow-200"
                : status.type === "error"
                  ? "bg-red-50 text-red-700 border border-red-200"
                  : "bg-blue-50 text-blue-700 border border-blue-200"
          }`}
        >
          <AlertCircle size={18} />
          {status.message}
        </div>
      )}

      {/* --- MATCH TIMING CONFIGURATION SECTION --- */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-8">
        <div className="p-5 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
          <Timer size={20} className="text-blue-600" />
          <div>
            <h2 className="text-lg font-bold text-gray-800">
              Match Timing Rules
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Define the exact duration and buffer interval to automatically
              calculate match slots.
            </p>
          </div>
        </div>

        <div className="p-6">
          <div className="bg-blue-50 text-blue-800 border border-blue-200 p-3 rounded-lg text-sm mb-6 flex items-start gap-2">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <p>
              <strong>Note:</strong> Generating slots uses the times set below.
              If you change these numbers later, you will need to clear and
              re-add your time blocks in the Schedule Section below to
              recalculate them.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">
                Match Duration (Minutes)
              </label>
              <input
                type="number"
                min="1"
                max="120"
                value={matchDuration}
                onChange={(e) => setMatchDuration(e.target.value)}
                className="w-full p-2.5 border border-gray-300 rounded-md outline-none bg-white text-gray-800 font-mono text-lg"
              />
              <p className="text-xs text-gray-500 mt-1">
                Expected time allocated per match.
              </p>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">
                Buffer Time (Minutes)
              </label>
              <input
                type="number"
                min="0"
                max="60"
                value={bufferTime}
                onChange={(e) => setBufferTime(e.target.value)}
                className="w-full p-2.5 border border-gray-300 rounded-md outline-none bg-white text-gray-800 font-mono text-lg"
              />
              <p className="text-xs text-gray-500 mt-1">
                Rest and transition time between matches.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* --- SCHEDULE GENERATOR SECTION --- */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-8">
        <div className="p-5 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
          <CalendarIcon size={20} className="text-indigo-600" />
          <div>
            <h2 className="text-lg font-bold text-gray-800">
              Tournament Schedule
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Select a time window, and the engine will automatically slice it
              into exact matches.
            </p>
          </div>
        </div>

        <div className="p-6">
          <form
            onSubmit={handleAddSlot}
            className="flex flex-col md:flex-row gap-4 mb-8 bg-indigo-50 p-5 rounded-lg border border-indigo-100"
          >
            <div className="flex-1">
              <label className="block text-sm font-semibold text-indigo-800 mb-1">
                Date
              </label>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="w-full p-2.5 border border-indigo-200 rounded-md outline-none bg-white text-gray-800"
              />
            </div>

            <div className="flex-1">
              <label className="block text-sm font-semibold text-indigo-800 mb-1">
                Start Time
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full p-2.5 border border-indigo-200 rounded-md outline-none bg-white text-gray-800 font-mono"
              />
            </div>

            <div className="flex-1">
              <label className="block text-sm font-semibold text-indigo-800 mb-1">
                End Time
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full p-2.5 border border-indigo-200 rounded-md outline-none bg-white text-gray-800 font-mono"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={!newDate || !startTime || !endTime}
                className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-6 rounded-md flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                <Plus size={18} /> Generate Slots
              </button>
            </div>
          </form>

          {isLoading ? (
            <div className="text-center text-gray-500 py-4">
              Loading settings...
            </div>
          ) : tournamentDays.length === 0 ? (
            <div className="text-center text-gray-500 py-10 border-2 border-dashed border-gray-200 rounded-lg bg-gray-50">
              No dates configured. Generate your first window above.
            </div>
          ) : (
            <div className="space-y-6">
              {tournamentDays.map((day) => (
                <div
                  key={day.date}
                  className="border border-gray-200 rounded-lg overflow-hidden shadow-sm"
                >
                  <div className="bg-gray-100 px-5 py-3 border-b border-gray-200 flex justify-between items-center">
                    <h3 className="font-black text-gray-800 text-lg tracking-tight">
                      {formatDisplayDate(day.date)}
                      <span className="ml-3 text-xs font-bold text-gray-500 bg-white border border-gray-200 px-2 py-1 rounded">
                        {day.slots.length} Matches
                      </span>
                    </h3>
                    <button
                      onClick={() => handleRemoveDay(day.date)}
                      className="text-red-500 hover:text-red-700 bg-white hover:bg-red-50 border border-red-100 px-3 py-1.5 rounded transition-colors text-xs font-bold flex items-center gap-1.5"
                    >
                      <Trash2 size={14} /> Clear Day
                    </button>
                  </div>

                  <div className="p-5 bg-white flex flex-wrap gap-2.5">
                    {day.slots.map((slot) => (
                      <div
                        key={slot.id}
                        className="flex items-center gap-2 bg-white border border-indigo-200 text-indigo-900 px-3 py-1.5 rounded-full shadow-sm"
                      >
                        <Clock size={12} className="text-indigo-500" />
                        <span className="font-bold text-sm tracking-tight">
                          {slot.label}
                        </span>
                        <button
                          onClick={() => handleRemoveSlot(day.date, slot.id)}
                          className="ml-1 text-gray-300 hover:text-red-500 transition-colors"
                          title="Remove individual slot"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    {day.slots.length === 0 && (
                      <span className="text-gray-400 text-sm italic">
                        All slots removed. Generate more above.
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* --- CUSTOM CATEGORY TAGS SECTION --- */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-8">
        <div className="p-5 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
          <Tags size={20} className="text-indigo-600" />
          <div>
            <h2 className="text-lg font-bold text-gray-800">
              Custom Category Tags
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Create tags (e.g., "Top Seed", "Beginner") to sort players for
              matchmaking.
            </p>
          </div>
        </div>

        <div className="p-6">
          <form onSubmit={handleAddCategory} className="flex gap-4 mb-6">
            <div className="flex-1">
              <input
                type="text"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Type a new category name..."
                className="w-full p-2.5 border border-gray-300 rounded-md outline-none bg-white text-gray-800"
              />
            </div>
            <button
              type="submit"
              disabled={!newCategory.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-6 rounded-md flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              <Plus size={18} /> Add Tag
            </button>
          </form>

          {playerCategories.length === 0 ? (
            <div className="text-gray-500 italic bg-gray-50 p-4 rounded border border-gray-100">
              No custom tags created yet.
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {playerCategories.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center gap-2 bg-indigo-50 text-indigo-800 border border-indigo-200 px-4 py-2 rounded-full shadow-sm font-medium"
                >
                  <Tag size={14} className="text-indigo-500" />
                  {cat.name}
                  <button
                    onClick={() => handleRemoveCategory(cat.id)}
                    className="ml-2 text-indigo-400 hover:text-red-600 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
