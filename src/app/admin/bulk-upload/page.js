"use client";

import { useState } from "react";
import { db } from "@/lib/firebase";
import { doc, writeBatch } from "firebase/firestore";
import {
  UploadCloud,
  Trophy,
  Download,
  Save,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { useTournament } from "@/components/TournamentSelector";
import Papa from "papaparse";

export default function BulkUploadPage() {
  const {
    activeTournament,
    tournaments,
    switchTournament,
    isLoading: tLoading,
  } = useTournament();

  const [file, setFile] = useState(null);
  const [tournamentType, setTournamentType] = useState("singles");
  const [csvData, setCsvData] = useState([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [summary, setSummary] = useState(null);

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

    const csvString = Papa.unparse(sampleData);
    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", "Sample_Player_Upload.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setIsParsing(true);
    setSummary(null);

    Papa.parse(selectedFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data;

        const parsedPlayers = rows.map((row, index) => {
          const getVal = (possibleKeys) => {
            const key = Object.keys(row).find((k) =>
              possibleKeys.includes(k.trim().toLowerCase()),
            );
            return key ? String(row[key]).trim() : "";
          };

          const mhtid = getVal(["mht id", "mhtid"]).toUpperCase();
          const name = getVal(["name"]);
          const mobile = getVal(["mobile"]);
          const category = getVal(["category"]);
          const lastYearRank = getVal([
            "lastyearrank",
            "last year rank",
            "rank",
          ]);
          const partnerMhtId = getVal([
            "partner mhtid",
            "partner mht id",
            "partnerid",
            "partner id",
          ]).toUpperCase();

          return {
            originalRow: index + 2,
            mhtid,
            name,
            mobile,
            category,
            lastYearRank,
            partnerMhtId,
            isValid: !!(mhtid && name),
          };
        });

        setCsvData(parsedPlayers);
        setIsParsing(false);
      },
      error: (error) => {
        console.error("CSV Parse Error:", error);
        alert("Error parsing CSV. Please check the file format.");
        setIsParsing(false);
      },
    });
  };

  const handleUploadToDatabase = async () => {
    if (!activeTournament)
      return alert("Error: No active tournament selected.");

    const validPlayers = csvData.filter((p) => p.isValid);
    if (validPlayers.length === 0) return alert("No valid players to upload.");

    setIsUploading(true);

    try {
      const batch = writeBatch(db);

      validPlayers.forEach((player) => {
        const playerRef = doc(db, "players", player.mhtid);
        const playerData = {
          name: player.name,
          mobile: player.mobile,
          lastYearRank: player.lastYearRank,
          updatedAt: new Date().toISOString(),
        };

        if (player.category) {
          playerData.category = player.category;
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
          player.mhtid,
        );

        batch.set(
          enrollmentRef,
          {
            playsSingles: tournamentType === "singles",
            playsDoubles: tournamentType === "doubles",
            partnerMhtId: player.partnerMhtId || null,
            enrolledAt: new Date().toISOString(),
          },
          { merge: true },
        );
      });

      await batch.commit();

      setSummary({
        success: validPlayers.length,
        failed: csvData.length - validPlayers.length,
      });
      setCsvData([]); // Clear preview table
      setFile(null);
      document.getElementById("file-upload").value = "";
    } catch (error) {
      console.error("Upload failed:", error);
      alert("Error saving players to database.");
    } finally {
      setIsUploading(false);
    }
  };

  const validCount = csvData.filter((p) => p.isValid).length;
  const invalidCount = csvData.length - validCount;

  if (tLoading)
    return (
      <div className="p-10 text-center text-gray-500">
        Loading tournaments...
      </div>
    );

  return (
    <div className="max-w-6xl mx-auto p-6 mt-10">
      <div className="bg-indigo-900 text-white p-5 rounded-xl shadow-md mb-8 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-white/10 p-3 rounded-lg">
            <Trophy size={28} className="text-yellow-400" />
          </div>
          <div>
            <h1 className="text-2xl font-black">Bulk Player Registration</h1>
            <p className="text-indigo-200 text-sm">
              Enrolling into: {activeTournament?.name}
            </p>
          </div>
        </div>
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
      </div>

      {summary && (
        <div className="bg-emerald-50 border border-emerald-200 p-5 rounded-xl mb-6 flex items-center gap-3 shadow-sm">
          <CheckCircle2 size={24} className="text-emerald-600" />
          <div>
            <h3 className="font-bold text-emerald-800 text-lg">
              Registration Successful
            </h3>
            <p className="text-emerald-600 text-sm">
              {summary.success} players enrolled for{" "}
              {tournamentType.toUpperCase()} in {activeTournament?.name}.
            </p>
          </div>
        </div>
      )}

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-8">
        <div className="flex flex-col md:flex-row justify-between md:items-end gap-6 mb-6">
          <div>
            <h2 className="text-lg font-bold text-gray-800 mb-2">
              Upload CSV File
            </h2>
            <p className="text-gray-500 text-sm mb-4">
              Required headers: <strong>MHT Id, Name</strong>. Optional headers:
              Mobile, Category, Rank, Partner MHT ID.
            </p>
            <button
              onClick={handleDownloadSample}
              className="flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold py-2 px-4 rounded-lg text-xs transition-colors shadow-sm border border-indigo-200"
            >
              <Download size={16} />
              Download Sample CSV
            </button>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 min-w-[250px]">
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
              Enrollment Type
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer font-medium text-sm">
                <input
                  type="radio"
                  name="tournament"
                  value="singles"
                  checked={tournamentType === "singles"}
                  onChange={(e) => setTournamentType(e.target.value)}
                  className="w-4 h-4 text-indigo-600"
                />
                Singles
              </label>
              <label className="flex items-center gap-2 cursor-pointer font-medium text-sm">
                <input
                  type="radio"
                  name="tournament"
                  value="doubles"
                  checked={tournamentType === "doubles"}
                  onChange={(e) => setTournamentType(e.target.value)}
                  className="w-4 h-4 text-indigo-600"
                />
                Doubles
              </label>
            </div>
          </div>
        </div>

        <label className="border-2 border-dashed border-indigo-300 bg-indigo-50 hover:bg-indigo-100 transition-colors rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer text-indigo-600">
          <UploadCloud size={40} className="mb-3" />
          <span className="font-bold text-lg">Click to select CSV file</span>
          <input
            id="file-upload"
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            className="hidden"
          />
        </label>
      </div>

      {isParsing && (
        <div className="text-center p-8 text-gray-500 font-bold animate-pulse">
          Reading CSV File...
        </div>
      )}

      {csvData.length > 0 && !isParsing && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden animate-in fade-in">
          <div className="p-5 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
            <div>
              <h3 className="font-black text-gray-800">Preview Roster</h3>
              <p className="text-sm font-medium mt-1 flex gap-4">
                <span className="text-emerald-600">
                  {validCount} Ready to Enroll
                </span>
                {invalidCount > 0 && (
                  <span className="text-red-500">
                    {invalidCount} Missing ID/Name
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={handleUploadToDatabase}
              disabled={isUploading || validCount === 0}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-6 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              <Save size={18} />{" "}
              {isUploading ? "Enrolling..." : `Register ${validCount} Players`}
            </button>
          </div>

          <div className="max-h-[600px] overflow-y-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead className="bg-white sticky top-0 shadow-sm">
                <tr className="border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">
                  <th className="p-4 w-16 text-center">Row</th>
                  <th className="p-4">MHT ID</th>
                  <th className="p-4">Player Name</th>
                  <th className="p-4">Category</th>
                  <th className="p-4">Partner ID</th>
                  <th className="p-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {csvData.map((row, idx) => (
                  <tr
                    key={idx}
                    className={
                      row.isValid ? "hover:bg-gray-50" : "bg-red-50/50"
                    }
                  >
                    <td className="p-4 text-center text-gray-400 font-mono">
                      {row.originalRow}
                    </td>
                    <td className="p-4 font-bold text-indigo-700 font-mono">
                      {row.mhtid || (
                        <span className="text-red-400">MISSING</span>
                      )}
                    </td>
                    <td className="p-4 font-semibold text-gray-800">
                      {row.name || (
                        <span className="text-red-400">MISSING</span>
                      )}
                    </td>
                    <td className="p-4 text-gray-600">{row.category || "-"}</td>
                    <td className="p-4 text-gray-500 font-mono">
                      {row.partnerMhtId || "-"}
                    </td>
                    <td className="p-4 text-center">
                      {row.isValid ? (
                        <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider">
                          Ready
                        </span>
                      ) : (
                        <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider">
                          Error
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
