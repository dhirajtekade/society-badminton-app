"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, getDoc, updateDoc } from "firebase/firestore";
import { GripVertical, Users, AlertCircle, CheckCircle2, Trophy } from "lucide-react";

export default function DragAndDropCategories() {
  const [categories, setCategories] = useState([]);
  const [players, setPlayers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState("");

  // Fetch data on load
  useEffect(() => {
    const fetchData = async () => {
      try {
        // 1. Fetch Categories
        const settingsRef = doc(db, "settings", "tournament");
        const settingsSnap = await getDoc(settingsRef);
        let activeCategories = [];
        if (settingsSnap.exists() && settingsSnap.data().playerCategories) {
          activeCategories = settingsSnap.data().playerCategories;
          setCategories(activeCategories);
        }

        // 2. Fetch Players
        const playersRef = collection(db, "players");
        const playersSnap = await getDocs(playersRef);
        const fetchedPlayers = [];
        
        playersSnap.forEach((doc) => {
          const data = doc.data();
          // Check if player's category exists in our new custom tags
          const isValidCategory = activeCategories.some(cat => cat.name === data.category);
          
          fetchedPlayers.push({
            id: doc.id,
            ...data,
            // If they have an old hardcoded category like "B" that isn't a tag anymore, reset to unassigned
            category: isValidCategory ? data.category : "Unassigned"
          });
        });
        
        setPlayers(fetchedPlayers);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  // --- NATIVE DRAG AND DROP HANDLERS ---
  const handleDragStart = (e, playerId) => {
    // Store the ID of the player being dragged
    e.dataTransfer.setData("playerId", playerId);
    // Make the drag image slightly transparent
    e.currentTarget.style.opacity = "0.5";
  };

  const handleDragEnd = (e) => {
    e.currentTarget.style.opacity = "1";
  };

  const handleDragOver = (e) => {
    // Prevent default to allow drop
    e.preventDefault(); 
    e.currentTarget.classList.add("bg-indigo-50/50"); // Visual feedback
  };

  const handleDragLeave = (e) => {
    e.currentTarget.classList.remove("bg-indigo-50/50");
  };

  const handleDrop = async (e, targetCategoryName) => {
    e.preventDefault();
    e.currentTarget.classList.remove("bg-indigo-50/50");
    
    const playerId = e.dataTransfer.getData("playerId");
    if (!playerId) return;

    const player = players.find(p => p.id === playerId);
    if (player.category === targetCategoryName) return; // Dropped in the same bucket

    // Optimistically update the UI instantly
    setPlayers(prev => prev.map(p => 
      p.id === playerId ? { ...p, category: targetCategoryName } : p
    ));

    // Save to Firestore in the background
    setSaveStatus("Saving...");
    try {
      const playerRef = doc(db, "players", playerId);
      // If dropped in Unassigned, we can clear the category or save it as empty string
      const newCatValue = targetCategoryName === "Unassigned" ? "" : targetCategoryName;
      
      await updateDoc(playerRef, {
        category: newCatValue,
        updatedAt: new Date().toISOString()
      });
      
      setSaveStatus("Saved");
      setTimeout(() => setSaveStatus(""), 2000);
    } catch (error) {
      console.error("Error updating player category:", error);
      setSaveStatus("Error!");
      // Revert UI on failure
      setPlayers(prev => prev.map(p => 
        p.id === playerId ? { ...p, category: player.category } : p
      ));
    }
  };

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading Rosters...</div>;
  }

  if (categories.length === 0) {
    return (
      <div className="max-w-4xl mx-auto p-6 mt-10 text-center">
        <AlertCircle size={48} className="mx-auto text-yellow-500 mb-4" />
        <h2 className="text-2xl font-bold text-gray-800">No Categories Found</h2>
        <p className="text-gray-500 mt-2">You need to create your custom category tags in the Admin Settings first before you can sort players.</p>
      </div>
    );
  }

  // --- BUILD THE COLUMNS ---
  // Create an array of column definitions: Unassigned + all custom categories
  const columns = [
    { name: "Unassigned", isDefault: true },
    ...categories
  ];

  return (
    <div className="p-6 mt-6 max-w-[1600px] mx-auto h-[calc(100vh-100px)] flex flex-col">
      <div className="flex justify-between items-end mb-6 shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Category Sorter</h1>
          <p className="text-gray-500 mt-1">Drag and drop players into their skill brackets.</p>
        </div>
        <div className="h-8 flex items-center">
          {saveStatus === "Saving..." && <span className="text-yellow-600 text-sm font-medium flex items-center gap-1"><AlertCircle size={14} /> Saving...</span>}
          {saveStatus === "Saved" && <span className="text-green-600 text-sm font-medium flex items-center gap-1"><CheckCircle2 size={14} /> Saved</span>}
        </div>
      </div>

      {/* Kanban Board Container */}
      <div className="flex-1 flex gap-4 overflow-x-auto pb-4 snap-x">
        {columns.map((col) => {
          const columnPlayers = players.filter(p => p.category === col.name);
          
          return (
            <div 
              key={col.name}
              className={`flex flex-col min-w-[300px] max-w-[300px] rounded-lg border shadow-sm snap-center ${
                col.isDefault ? 'bg-gray-100 border-gray-200' : 'bg-indigo-50/30 border-indigo-100'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, col.name)}
            >
              {/* Column Header */}
              <div className={`p-4 border-b flex justify-between items-center rounded-t-lg ${
                col.isDefault ? 'bg-gray-200/50' : 'bg-indigo-100/50 text-indigo-900'
              }`}>
                <h2 className="font-bold">{col.name}</h2>
                <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                  col.isDefault ? 'bg-gray-300 text-gray-700' : 'bg-indigo-200 text-indigo-800'
                }`}>
                  {columnPlayers.length}
                </span>
              </div>

              {/* Scrollable Player List */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[150px]">
                {columnPlayers.length === 0 && (
                  <div className="text-center p-4 text-sm text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
                    Drop players here
                  </div>
                )}
                
                {columnPlayers.map(player => (
                  <div 
                    key={player.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, player.id)}
                    onDragEnd={handleDragEnd}
                    className="bg-white p-3 rounded shadow-sm border border-gray-200 cursor-grab active:cursor-grabbing hover:border-indigo-300 hover:shadow transition-all group"
                  >
                    <div className="flex items-start gap-2">
                      <div className="mt-1 text-gray-300 group-hover:text-indigo-400">
                        <GripVertical size={16} />
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <div className="font-bold text-gray-800 truncate">{player.name}</div>
                        <div className="text-xs text-gray-500 font-mono mt-0.5">ID: {player.id}</div>
                        
                        <div className="mt-2 flex gap-2">
                          {player.playsSingles && (
                            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                              <Trophy size={10} /> Singles
                            </span>
                          )}
                          {player.playsDoubles && (
                            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">
                              <Users size={10} /> Doubles
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}