"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase"; 
import { doc, getDoc, setDoc } from "firebase/firestore";
import { LogIn, User, Calendar, Camera, LogOut, ChevronRight, Trophy, Users, ArrowLeft, Save, CheckCircle2 } from "lucide-react";

export default function PlayerPortal() {
  const [mhtId, setMhtId] = useState("");
  const [playerData, setPlayerData] = useState(null);
  
  // App States
  const [activeView, setActiveView] = useState("dashboard"); 
  const [isLoading, setIsLoading] = useState(false);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [error, setError] = useState("");

  // Availability States
  const [tournamentDays, setTournamentDays] = useState([]);
  const [selectedSlots, setSelectedSlots] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  // Photo Upload States
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      const storedId = localStorage.getItem("society_badminton_userId");
      if (storedId) {
        await fetchAndSetPlayer(storedId);
      } else {
        setIsPageLoading(false);
      }
    };
    checkSession();
  }, []);

  const fetchAndSetPlayer = async (id) => {
    setIsLoading(true);
    try {
      const docRef = doc(db, "players", id);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = { id: docSnap.id, ...docSnap.data() };
        setPlayerData(data);
        localStorage.setItem("society_badminton_userId", docSnap.id);
        setError("");
      } else {
        setError("MHT ID not found. Please check and try again.");
        localStorage.removeItem("society_badminton_userId");
      }
    } catch (err) {
      console.error("Login error:", err);
      setError("An error occurred connecting to the database.");
    } finally {
      setIsLoading(false);
      setIsPageLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!mhtId.trim()) return;
    await fetchAndSetPlayer(mhtId.trim());
  };

  const handleLogout = () => {
    localStorage.removeItem("society_badminton_userId");
    setPlayerData(null);
    setMhtId("");
    setActiveView("dashboard");
  };

  // --- AVAILABILITY LOGIC WITH DEFAULT-ALL ---
  const openAvailability = async () => {
    setActiveView("availability");
    
    try {
      const docRef = doc(db, "settings", "tournament");
      const docSnap = await getDoc(docRef);
      if (docSnap.exists() && docSnap.data().tournamentDays) {
        const days = docSnap.data().tournamentDays;
        setTournamentDays(days);

        // Collect all slot block IDs
        const allSlotIds = [];
        days.forEach(day => {
          day.slots.forEach(slot => {
            allSlotIds.push(slot.id);
          });
        });

        // FIXED: Check if availability property exists at all in the database. 
        // If it's undefined (meaning they never clicked save before), default to ALL slots checked!
        if (playerData.availability !== undefined) {
          setSelectedSlots(playerData.availability);
        } else {
          setSelectedSlots(allSlotIds);
        }
      }
    } catch (error) {
      console.error("Error fetching schedule:", error);
    }
  };
  const toggleSlot = (slotId) => {
    setSelectedSlots(prev => 
      prev.includes(slotId) ? prev.filter(id => id !== slotId) : [...prev, slotId]
    );
  };

  const saveAvailability = async () => {
    setIsSaving(true);
    try {
      await setDoc(doc(db, "players", playerData.id), {
        availability: selectedSlots,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      
      setPlayerData(prev => ({ ...prev, availability: selectedSlots }));
      setActiveView("dashboard");
    } catch (error) {
      console.error("Error saving availability:", error);
      alert("Failed to save availability.");
    } finally {
      setIsSaving(false);
    }
  };

  const formatDisplayDate = (dateString) => {
    const options = { weekday: 'long', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('en-IN', options);
  };

  // --- ZERO-COST PHOTO COMPRESSOR LOGIC ---
  const handlePhotoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingPhoto(true);

    const reader = new FileReader();
    reader.readAsDataURL(file);
    
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      
      img.onload = async () => {
        const canvas = document.createElement("canvas");
        const MAX_SIZE = 250; 
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        const base64String = canvas.toDataURL("image/jpeg", 0.6);

        try {
          await setDoc(doc(db, "players", playerData.id), {
            photoUrl: base64String,
            updatedAt: new Date().toISOString()
          }, { merge: true });
          
          setPlayerData(prev => ({ ...prev, photoUrl: base64String }));
          alert("Profile photo updated successfully!");
          setActiveView("dashboard");
        } catch (error) {
          console.error("Error saving photo string:", error);
          alert("Failed to save photo. It might be too large.");
        } finally {
          setUploadingPhoto(false);
        }
      };
    };
  };

  if (isPageLoading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading...</div>;

  // --- LOGIN SCREEN ---
  if (!playerData) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="bg-blue-600 p-6 text-center">
            <h1 className="text-2xl font-bold text-white mb-2">Tournament Portal</h1>
            <p className="text-blue-100 text-sm">Society Badminton Championship</p>
          </div>
          <form onSubmit={handleLogin} className="p-6 md:p-8">
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Enter your MHT ID</label>
              <input type="text" value={mhtId} onChange={(e) => setMhtId(e.target.value)} placeholder="e.g. 1042" className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" required />
              {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
            </div>
            <button type="submit" disabled={isLoading || !mhtId.trim()} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-lg flex justify-center gap-2 transition-colors disabled:opacity-70">
              {isLoading ? "Verifying..." : <><LogIn size={20} /> Login to Portal</>}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // --- AVAILABILITY SCREEN ---
  if (activeView === "availability") {
    return (
      <div className="max-w-md mx-auto min-h-screen bg-gray-50 pb-24 relative">
        <div className="bg-white px-5 py-4 flex justify-between items-center shadow-sm border-b sticky top-0 z-10">
          <button onClick={() => setActiveView("dashboard")} className="text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium">
            <ArrowLeft size={18} /> Back
          </button>
          <div className="font-bold text-gray-800">My Availability</div>
          <div className="w-16"></div>
        </div>
        
        <div className="p-4">
          <div className="bg-blue-50 text-blue-800 p-4 rounded-lg border border-blue-100 mb-6 text-sm">
            You are marked available for all slots by default. Uncheck any slots where you <strong>cannot</strong> play.
          </div>

          {tournamentDays.length === 0 ? (
            <div className="text-center p-8 bg-white rounded border text-gray-500">No schedule published yet.</div>
          ) : (
            tournamentDays.map((day) => (
              <div key={day.date} className="mb-5 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="bg-gray-100 px-4 py-3 border-b border-gray-200 font-bold text-gray-800">{formatDisplayDate(day.date)}</div>
                <div>
                  {day.slots.map((slot) => {
                    const isSelected = selectedSlots.includes(slot.id);
                    return (
                      <label key={slot.id} className={`flex items-center p-4 border-b last:border-0 cursor-pointer ${isSelected ? 'bg-blue-50/50' : 'hover:bg-gray-50'}`}>
                        <div className="flex-1 font-semibold text-base text-gray-800">{slot.label}</div>
                        <div className={`w-6 h-6 rounded-md flex items-center justify-center border-2 ${isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300'}`}>
                          {isSelected && <CheckCircle2 size={16} strokeWidth={3} />}
                        </div>
                        <input type="checkbox" className="hidden" checked={isSelected} onChange={() => toggleSlot(slot.id)} />
                      </label>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
        
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 shadow-lg z-20 max-w-md mx-auto">
          <button onClick={saveAvailability} disabled={isSaving} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-lg flex justify-center gap-2 disabled:opacity-50">
            <Save size={20} /> {isSaving ? "Saving..." : "Save My Availability"}
          </button>
        </div>
      </div>
    );
  }

  // --- PHOTO UPLOAD SCREEN ---
  if (activeView === "photo") {
    return (
      <div className="max-w-md mx-auto min-h-screen bg-gray-50">
        <div className="bg-white px-5 py-4 flex justify-between items-center shadow-sm border-b sticky top-0 z-10">
          <button onClick={() => setActiveView("dashboard")} className="text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium">
            <ArrowLeft size={18} /> Back
          </button>
          <div className="font-bold text-gray-800">Profile Photo</div>
          <div className="w-16"></div>
        </div>

        <div className="p-6 flex flex-col items-center">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 w-full flex flex-col items-center text-center">
            <div className="w-32 h-32 rounded-full bg-gray-100 border-4 border-white shadow-lg overflow-hidden flex items-center justify-center mb-6">
              {playerData.photoUrl ? (
                <img src={playerData.photoUrl} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <User size={48} className="text-gray-400" />
              )}
            </div>

            <h3 className="text-lg font-bold text-gray-800 mb-2">Upload Display Picture</h3>
            <p className="text-sm text-gray-500 mb-8">Take a selfie or upload a photo from your gallery so other players can recognize you.</p>

            <label className={`w-full ${uploadingPhoto ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'} text-white font-bold py-3.5 rounded-lg flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-sm`}>
              {uploadingPhoto ? "Processing..." : <><Camera size={20} /> Open Camera / Gallery</>}
              <input type="file" accept="image/*" capture="user" className="hidden" onChange={handlePhotoUpload} disabled={uploadingPhoto} />
            </label>
          </div>
        </div>
      </div>
    );
  }

  // --- DEFAULT DASHBOARD ---
  return (
    <div className="max-w-md mx-auto min-h-screen bg-gray-50 pb-10">
      <div className="bg-white px-5 py-4 flex justify-between items-center shadow-sm border-b sticky top-0 z-10">
        <div className="font-bold text-gray-800 text-lg">My Portal</div>
        <button onClick={handleLogout} className="text-gray-500 hover:text-red-600 flex items-center gap-1 text-sm font-medium">
          <LogOut size={16} /> Logout
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl shadow-md p-5 text-white">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center border-2 border-white/40 overflow-hidden shadow-inner">
              {playerData.photoUrl ? (
                <img src={playerData.photoUrl} alt={playerData.name} className="w-full h-full object-cover" />
              ) : (
                <User size={32} className="text-white" />
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold">{playerData.name}</h2>
              <p className="text-blue-100 text-sm font-medium">MHT ID: {playerData.id}</p>
              <div className="mt-1 inline-block bg-white/20 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide">
                Category {playerData.category || "Unassigned"}
              </div>
            </div>
          </div>
          <div className="bg-black/10 rounded-lg p-3 flex justify-around">
            <div className={`flex flex-col items-center ${playerData.playsSingles ? 'opacity-100' : 'opacity-40'}`}>
              <Trophy size={18} className="mb-1" />
              <span className="text-xs font-medium">Singles</span>
            </div>
            <div className={`flex flex-col items-center ${playerData.playsDoubles ? 'opacity-100' : 'opacity-40'}`}>
              <Users size={18} className="mb-1" />
              <span className="text-xs font-medium">Doubles</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <button onClick={openAvailability} className="w-full p-4 flex justify-between border-b border-gray-100 hover:bg-gray-50 text-left items-center">
            <div className="flex items-center gap-3">
              <div className="bg-green-100 p-2 rounded-lg text-green-600 relative">
                <Calendar size={20} />
              </div>
              <div>
                <div className="font-bold text-gray-800">My Availability</div>
                <div className="text-xs text-gray-500">
                  {playerData.availability?.length > 0 
                    ? `${playerData.availability.length} custom slots selected` 
                    : "Default: Available for all slots"}
                </div>
              </div>
            </div>
            <ChevronRight size={20} className="text-gray-400" />
          </button>

          <button onClick={() => setActiveView("photo")} className="w-full p-4 flex justify-between hover:bg-gray-50 text-left items-center">
            <div className="flex items-center gap-3">
              <div className="bg-purple-100 p-2 rounded-lg text-purple-600 relative">
                <Camera size={20} />
                {!playerData.photoUrl && (
                  <span className="absolute -top-1 -right-1 flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span></span>
                )}
              </div>
              <div>
                <div className="font-oid text-gray-800 font-bold">Profile Photo</div>
                <div className="text-xs text-gray-500">{playerData.photoUrl ? "Update your picture" : "Required: Upload display picture"}</div>
              </div>
            </div>
            <ChevronRight size={20} className="text-gray-400" />
          </button>
        </div>
      </div>
    </div>
  );
}