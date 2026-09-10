"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { db } from "@/lib/firebase";
import { doc, writeBatch } from "firebase/firestore";
import { UploadCloud, Trophy, Download } from "lucide-react"; // NEW: Added Download icon
import { useTournament } from "@/components/TournamentSelector";

export default function BulkUploadPage() {
  const {
    activeTournament,
    tournaments,
    switchTournament,
    isLoading: tLoading,
  } = useTournament();

  const [file, setFile] = useState(null);
  const [tournamentType, setTournamentType] = useState("singles");
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // --- NEW: Generate and Download Sample Excel File ---
  const handleDownloadSample = () => {
    const sampleData = [
      {
        "MHT Id": "MHT001",
        Name: "John Doe",
        Mobile: "9876543210",
        Category: "Advanced",
        "Last Year Rank": 5,
        "Partner MHT ID": "",
      },
      {
        "MHT Id": "MHT002",
        Name: "Jane Smith",
        Mobile: "9123456780",
        Category: "Beginner",
        "Last Year Rank": "",
        "Partner MHT ID": "MHT003",
      },
      {
        "MHT Id": "MHT003",
        Name: "Alice Johnson",
        Mobile: "9988776655",
        Category: "Beginner",
        "Last Year Rank": "",
        "Partner MHT ID": "MHT002",
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sample Format");

    // Optional: Adjust column widths to make it look nice
    const columnWidths = [
      { wch: 15 }, // MHT Id
      { wch: 20 }, // Name
      { wch: 15 }, // Mobile
      { wch: 15 }, // Category
      { wch: 15 }, // Last Year Rank
      { wch: 20 }, // Partner MHT ID
    ];
    worksheet["!cols"] = columnWidths;

    XLSX.writeFile(workbook, "Sample_Player_Upload.xlsx");
  };

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

        setStatus(
          `Found ${rows.length} rows. Enrolling into ${activeTournament.name}...`,
        );

        const batch = writeBatch(db);
        let validPlayers = 0;

        rows.forEach((row) => {
          const getVal = (possibleKeys) => {
            const key = Object.keys(row).find((k) =>
              possibleKeys.includes(k.trim().toLowerCase()),
            );
            return key ? row[key] : "";
          };

          const mhtid = getVal(["mht id", "mhtid"]);
          const name = getVal(["name"]);
          const mobile = getVal(["mobile"]);
          const category = getVal(["category"]);
          const lastYearRank = getVal(["lastyearrank", "last year rank"]);
          const partnerMhtId = getVal([
            "partner mhtid",
            "partner mht id",
            "partnerid",
            "partner id",
          ]);

          if (mhtid && name) {
            const cleanMhtid = String(mhtid).trim();
            const cleanCategory = String(category).trim();

            const playerRef = doc(db, "players", cleanMhtid);
            const playerData = {
              name: String(name).trim(),
              mobile: String(mobile).trim(),
              lastYearRank: String(lastYearRank).trim(),
              updatedAt: new Date().toISOString(),
            };

            if (cleanCategory) {
              playerData.category = cleanCategory;
            }

            if (tournamentType === "singles") {
              playerData.playsSingles = true;
            } else {
              playerData.playsDoubles = true;
            }
            batch.set(playerRef, playerData, { merge: true });

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
                playsSingles: tournamentType === "singles",
                playsDoubles: tournamentType === "doubles",
                partnerMhtId: partnerMhtId ? String(partnerMhtId).trim() : null,
                enrolledAt: new Date().toISOString(),
              },
              { merge: true },
            );

            validPlayers++;
          }
        });

        if (validPlayers > 0) {
          await batch.commit();
          setStatus(
            `Success! ${validPlayers} players registered for ${tournamentType.toUpperCase()} in ${activeTournament.name}.`,
          );
        } else {
          setStatus(
            "No valid players found. Make sure your file has 'MHT Id' and 'Name' columns.",
          );
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

  if (tLoading)
    return (
      <div className="p-10 text-center text-gray-500">
        Loading tournaments...
      </div>
    );

  return (
    <div className="max-w-xl mx-auto p-6 mt-10 bg-white rounded-lg shadow-md border">
      <div className="bg-indigo-900 text-white p-4 rounded-xl shadow-sm mb-6 flex justify-between items-center">
        <div className="flex items-center gap-2.5">
          <Trophy size={22} className="text-yellow-400" />
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">
              Enrolling Into
            </div>
            <div className="text-base font-black">{activeTournament?.name}</div>
          </div>
        </div>

        <select
          value={activeTournament?.id || ""}
          onChange={(e) => switchTournament(e.target.value)}
          className="bg-indigo-800 text-white border border-indigo-700 p-2 rounded-lg text-xs font-bold outline-none cursor-pointer"
        >
          {tournaments.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <h1 className="text-2xl font-bold mb-6 text-gray-800">
        Bulk Upload Players
      </h1>

      {/* --- REVISED INFORMATION BOX WITH DOWNLOAD BUTTON --- */}
      <div className="mb-6 p-4 bg-blue-50 border border-blue-100 rounded-md text-sm text-blue-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <p className="font-semibold mb-2">File Requirements:</p>
          <p>
            Upload a <strong>.csv</strong> or <strong>.xlsx</strong> (Excel)
            file.
          </p>
          <p>
            Ensure your header row includes: <strong>MHT Id, Name</strong>
          </p>
          <p className="mt-1">
            Optional headers:{" "}
            <strong>Mobile, Category, Last Year Rank, Partner MHT ID</strong>
          </p>
        </div>
        <button
          onClick={handleDownloadSample}
          className="flex items-center gap-2 bg-blue-200 hover:bg-blue-300 text-blue-900 font-bold py-2 px-4 rounded-lg text-xs transition-colors shrink-0 shadow-sm"
        >
          <Download size={16} />
          Download Sample
        </button>
      </div>

      <div className="flex flex-col gap-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Tournament List Type:
          </label>
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
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select File:
          </label>
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
          {isLoading
            ? "Processing..."
            : `Upload & Enroll in ${activeTournament?.name}`}
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
