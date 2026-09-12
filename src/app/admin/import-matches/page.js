"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, writeBatch } from "firebase/firestore";
import {
  UploadCloud,
  AlertCircle,
  CheckCircle2,
  Save,
  FileSpreadsheet,
  XCircle,
} from "lucide-react";
import Papa from "papaparse";
import { useTournament } from "@/components/TournamentSelector";

export default function ImportMatchesPage() {
  const {
    tournaments,
    activeTournament,
    switchTournament,
    isLoading: tLoading,
  } = useTournament();

  const [playersMap, setPlayersMap] = useState({});
  const [csvData, setCsvData] = useState([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [summary, setSummary] = useState(null);

  // 1. Fetch Players to build the Name-to-ID Dictionary
  useEffect(() => {
    const fetchPlayers = async () => {
      try {
        const snap = await getDocs(collection(db, "players"));
        const map = {};
        snap.forEach((doc) => {
          const data = doc.data();
          if (data.name) {
            // AGGRESSIVE NORMALIZE: lowercase, remove all extra spaces
            const normalizedName = data.name
              .toLowerCase()
              .replace(/\s+/g, " ")
              .trim();
            map[normalizedName] = {
              id: doc.id,
              originalName: data.name,
            };
          }
        });
        setPlayersMap(map);
      } catch (error) {
        console.error("Error fetching players for mapping:", error);
      }
    };
    fetchPlayers();
  }, []);

  // 2. Handle CSV Upload and Parsing
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsParsing(true);
    setSummary(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsedMatches = results.data.map((row, index) => {
          // AGGRESSIVE NORMALIZE the CSV names before looking them up
          const p1Raw = (row["Player 1 Name"] || "")
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim();
          const p2Raw = (row["Player 2 Name"] || "")
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim();

          const p1Lookup = playersMap[p1Raw];
          const p2Lookup = playersMap[p2Raw];

          const scoreA = parseInt(row["P1 Score"], 10) || 0;
          const scoreB = parseInt(row["P2 Score"], 10) || 0;

          return {
            originalRow: index + 2,
            matchNo: row["Match No"] || `Auto-${index}`,
            p1Raw: row["Player 1 Name"] || "", // Keep original for display
            p2Raw: row["Player 2 Name"] || "", // Keep original for display
            p1Id: p1Lookup?.id || null,
            p2Id: p2Lookup?.id || null,
            scoreA,
            scoreB,
            isValid: !!(p1Lookup && p2Lookup),
          };
        });

        setCsvData(parsedMatches);
        setIsParsing(false);
      },
      error: (error) => {
        console.error("CSV Parse Error:", error);
        alert("Failed to parse CSV file.");
        setIsParsing(false);
      },
    });
  };

  // 3. Commit to Firebase with Smart Overwrite
  const handleUploadToDatabase = async () => {
    if (!activeTournament)
      return alert("Please select an active tournament first.");

    const validMatches = csvData.filter((m) => m.isValid);
    if (validMatches.length === 0) return alert("No valid matches to upload.");

    setIsUploading(true);

    try {
      // Fetch existing matches to check for duplicates
      const matchesSnap = await getDocs(
        collection(db, "tournaments", activeTournament.id, "matches"),
      );
      const existingMatches = [];
      matchesSnap.forEach((d) =>
        existingMatches.push({ id: d.id, ...d.data() }),
      );

      const batch = writeBatch(db);
      let updatedCount = 0;
      let createdCount = 0;

      validMatches.forEach((match, index) => {
        const p1Id = match.p1Id;
        const p2Id = match.p2Id;

        // Search for an existing match between these two players
        const existingMatch = existingMatches.find((m) => {
          const tA = m.teamA || [];
          const tB = m.teamB || [];
          const isExactMatch = tA.includes(p1Id) && tB.includes(p2Id);
          const isFlippedMatch = tA.includes(p2Id) && tB.includes(p1Id);
          return isExactMatch || isFlippedMatch;
        });

        if (existingMatch) {
          // OVERWRITE EXISTING MATCH
          const docRef = doc(
            db,
            "tournaments",
            activeTournament.id,
            "matches",
            existingMatch.id,
          );

          let finalScoreA = match.scoreA;
          let finalScoreB = match.scoreB;

          // If the database has Player 2 as Team A, flip the incoming scores so they map correctly
          if (
            existingMatch.teamA.includes(p2Id) &&
            existingMatch.teamB.includes(p1Id)
          ) {
            finalScoreA = match.scoreB;
            finalScoreB = match.scoreA;
          }

          batch.set(
            docRef,
            {
              scoreA: finalScoreA,
              scoreB: finalScoreB,
              status: "completed",
              updatedAt: new Date().toISOString(),
            },
            { merge: true },
          );

          updatedCount++;
        } else {
          // CREATE NEW MATCH (Fallback if no fixture existed)
          const docRef = doc(
            collection(db, "tournaments", activeTournament.id, "matches"),
          );

          batch.set(docRef, {
            type: "singles", // Assuming these are singles based on your screenshot
            stage: "Historical Import",
            teamA: [match.p1Id],
            teamB: [match.p2Id],
            scoreA: match.scoreA,
            scoreB: match.scoreB,
            status: "completed",
            court: "Historical",
            timeSlot: "Imported Record",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            order: index,
          });

          createdCount++;
        }
      });

      await batch.commit();

      setSummary({
        success: validMatches.length,
        updated: updatedCount,
        created: createdCount,
        failed: csvData.length - validMatches.length,
      });
      setCsvData([]); // Clear preview
    } catch (error) {
      console.error("Batch write error:", error);
      alert("Failed to upload matches to the database.");
    } finally {
      setIsUploading(false);
    }
  };

  const validCount = csvData.filter((m) => m.isValid).length;
  const invalidCount = csvData.length - validCount;

  if (tLoading)
    return (
      <div className="p-10 text-center text-gray-500">Loading workspace...</div>
    );

  return (
    <div className="max-w-6xl mx-auto p-6 mt-10">
      <div className="bg-indigo-900 text-white p-5 rounded-xl shadow-md mb-8 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-white/10 p-3 rounded-lg">
            <FileSpreadsheet size={28} className="text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-black">Historical Match Import</h1>
            <p className="text-indigo-200 text-sm">
              Target Tournament: {activeTournament?.name}
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
              Import Successful
            </h3>
            <p className="text-emerald-600 text-sm">
              Processed {summary.success} matches. Overwrote {summary.updated}{" "}
              existing fixtures and created {summary.created} new records.
            </p>
          </div>
        </div>
      )}

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-8">
        <h2 className="text-lg font-bold text-gray-800 mb-2">
          Upload CSV File
        </h2>
        <p className="text-gray-500 text-sm mb-6">
          Expected headers: <strong>Match No</strong>,{" "}
          <strong>Player 1 Name</strong>, <strong>Player 2 Name</strong>,{" "}
          <strong>P1 Score</strong>, <strong>P2 Score</strong>. The system will
          auto-match names to MHT IDs and update existing fixtures if found.
        </p>

        <label className="border-2 border-dashed border-indigo-300 bg-indigo-50 hover:bg-indigo-100 transition-colors rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer text-indigo-600">
          <UploadCloud size={40} className="mb-3" />
          <span className="font-bold text-lg">Click to select CSV file</span>
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>
      </div>

      {csvData.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden animate-in fade-in">
          <div className="p-5 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
            <div>
              <h3 className="font-black text-gray-800">Preview Data</h3>
              <p className="text-sm font-medium mt-1 flex gap-4">
                <span className="text-emerald-600">
                  {validCount} Ready to Import
                </span>
                {invalidCount > 0 && (
                  <span className="text-red-500">
                    {invalidCount} Name Errors
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
              {isUploading ? "Uploading..." : `Import ${validCount} Matches`}
            </button>
          </div>

          <div className="max-h-[600px] overflow-y-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead className="bg-white sticky top-0 shadow-sm">
                <tr className="border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">
                  <th className="p-4 w-16 text-center">Row</th>
                  <th className="p-4 w-24">Match No</th>
                  <th className="p-4">Player 1 (Mapped ID)</th>
                  <th className="p-4 text-center">Score</th>
                  <th className="p-4">Player 2 (Mapped ID)</th>
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
                    <td className="p-4 font-bold text-gray-700">
                      {row.matchNo}
                    </td>
                    <td className="p-4">
                      <div className="font-semibold text-gray-800">
                        {row.p1Raw}
                      </div>
                      {row.p1Id ? (
                        <div className="text-xs text-emerald-600 font-mono mt-0.5 flex items-center gap-1">
                          <CheckCircle2 size={12} /> {row.p1Id}
                        </div>
                      ) : (
                        <div className="text-xs text-red-500 font-bold mt-0.5 flex items-center gap-1">
                          <AlertCircle size={12} /> Not Found
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-center font-black text-lg text-indigo-900">
                      {row.scoreA} - {row.scoreB}
                    </td>
                    <td className="p-4">
                      <div className="font-semibold text-gray-800">
                        {row.p2Raw}
                      </div>
                      {row.p2Id ? (
                        <div className="text-xs text-emerald-600 font-mono mt-0.5 flex items-center gap-1">
                          <CheckCircle2 size={12} /> {row.p2Id}
                        </div>
                      ) : (
                        <div className="text-xs text-red-500 font-bold mt-0.5 flex items-center gap-1">
                          <AlertCircle size={12} /> Not Found
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-center">
                      {row.isValid ? (
                        <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-xs font-bold uppercase tracking-wider">
                          Ready
                        </span>
                      ) : (
                        <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold uppercase tracking-wider">
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
