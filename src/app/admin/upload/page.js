"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { db } from "@/lib/firebase";
import { doc, writeBatch } from "firebase/firestore";
import { UploadCloud, Trophy } from "lucide-react";
import { useTournament } from "@/components/TournamentSelector";

export default function BulkUploadPage() {
  const { activeTournament, tournaments, switchTournament, isLoading: tLoading } = useTournament();
  
  const [file, setFile] = useState(null);
  const [tournamentType, setTournamentType] = useState("singles");
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleUpload = async () => {
    if (!file) {
      setStatus("Please select a file first.");
      return;
    }

    if (!activeTournament) {
      setStatus("Error: No active tournament selected.");
      return;
    }

    setIsLoading(true);
    setStatus("Reading Excel/CSV file...");

    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });

        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { raw: false });

        setStatus(`Found ${rows.length} rows. Enrolling into ${activeTournament.name}...`);
        
        const batch = writeBatch(db);
        let validPlayers = 0;

        rows.forEach((row) => {
          const getVal = (possibleKeys) => {
            const key = Object.keys(row).find(k => possibleKeys.includes(k.trim().toLowerCase()));
            return key ? row[key] : "";
          };

          const mhtid = getVal(["mht id", "mhtid"]);
          const name = getVal(["name"]);
          const mobile = getVal(["mobile"]);
          const category = getVal(["category"]);
          const lastYearRank = getVal(["lastyearrank", "last year rank"]);

          if (mhtid && name) {
            const cleanMhtid = String(mhtid).trim();
            const cleanCategory = String(category).trim();
            
            // 1. Save/Update Master Player Profile (The Single Source of Truth)
            const playerRef = doc(db, "players", cleanMhtid);
            const playerData = {
              name: String(name).trim(),
              mobile: String(mobile).trim(),
              lastYearRank: String(lastYearRank).trim(),
              updatedAt: new Date().toISOString()
            };

            // SAFEGUARD: Only update the Master category if the Excel explicitly provides one.
            // This prevents overwriting manually sorted players with blanks on re-uploads.
            if (cleanCategory) {
              playerData.category = cleanCategory;
            }

            if (tournamentType === "singles") {
              playerData.playsSingles = true;
            } else {
              playerData.playsDoubles = true;
            }
            batch.set(playerRef, playerData, { merge: true });

            // 2. Enroll Player into Active Tournament Roster Sub-collection
            // NORMALIZED: Only storing enrollment data, no names or categories!
            const enrollmentRef = doc(db, "tournaments", activeTournament.id, "players", cleanMhtid);
            batch.set(enrollmentRef, {
              playsSingles: tournamentType === "singles",
              playsDoubles: tournamentType === "doubles",
              enrolledAt: new Date().toISOString()
            }, { merge: true });

            validPlayers++;
          }
        });

        if (validPlayers > 0) {
          await batch.commit();
          setStatus(`Success! ${validPlayers} players registered for ${tournamentType.toUpperCase()} in ${activeTournament.name}.`);
        } else {
          setStatus("No valid players found. Make sure your file has 'MHT Id' and 'Name' columns.");
        }
      } catch (error) {
        console.error("Upload failed:", error);
        setStatus("Error processing file. Check console.");
      } finally {
        setIsLoading(false);
        setFile(null); 
        document.getElementById("file-upload").value = "";
      }
    };

    reader.onerror = () => {
      setStatus("Error reading the file from your computer.");
      setIsLoading(false);
    };

    reader.readAsArrayBuffer(file);
  };

  if (tLoading) return <div className="p-10 text-center text-gray-500">Loading tournaments...</div>;

  return (
    <div className="max-w-xl mx-auto p-6 mt-10 bg-white rounded-lg shadow-md border">
      
      {/* --- ACTIVE TOURNAMENT BANNER --- */}
      <div className="bg-indigo-900 text-white p-4 rounded-xl shadow-sm mb-6 flex justify-between items-center">
        <div className="flex items-center gap-2.5">
          <Trophy size={22} className="text-yellow-400" />
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">Enrolling Into</div>
            <div className="text-base font-black">{activeTournament?.name}</div>
          </div>
        </div>

        <select 
          value={activeTournament?.id || ""} 
          onChange={e => switchTournament(e.target.value)}
          className="bg-indigo-800 text-white border border-indigo-700 p-2 rounded-lg text-xs font-bold outline-none cursor-pointer"
        >
          {tournaments.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      <h1 className="text-2xl font-bold mb-6 text-gray-800">Bulk Upload Players</h1>
      
      <div className="mb-6 p-4 bg-blue-50 border border-blue-100 rounded-md text-sm text-blue-800">
        <p className="font-semibold mb-2">File Requirements:</p>
        <p>Upload a <strong>.csv</strong> or <strong>.xlsx</strong> (Excel) file.</p>
        <p>Ensure your header row includes: <strong>MHT Id, Name</strong></p>
        <p className="mt-1">Optional headers: <strong>Mobile, Category, LastYearRank</strong></p>
      </div>

      <div className="flex flex-col gap-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Select Tournament List Type:</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input 
                type="radio" 
                name="tournament" 
                value="singles" 
                checked={tournamentType === "singles"}
                onChange={(e) => setTournamentType(e.target.value)}
                className="w-4 h-4 text-blue-600"
              />
              Singles
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input 
                type="radio" 
                name="tournament" 
                value="doubles" 
                checked={tournamentType === "doubles"}
                onChange={(e) => setTournamentType(e.target.value)}
                className="w-4 h-4 text-blue-600"
              />
              Doubles
            </label>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Select File:</label>
          <input 
            id="file-upload"
            type="file" 
            accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
            onChange={(e) => setFile(e.target.files[0])}
            className="border border-gray-300 p-2 rounded w-full"
          />
        </div>
        
        <button 
          onClick={handleUpload}
          disabled={isLoading}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
        >
          <UploadCloud size={20} />
          {isLoading ? "Processing..." : `Upload & Enroll in ${activeTournament?.name}`}
        </button>

        {status && (
          <div className="mt-2 p-3 bg-gray-100 rounded text-gray-700 text-center font-medium">
            {status}
          </div>
        )}
      </div>
    </div>
  );
}