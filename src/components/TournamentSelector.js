"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, addDoc, doc, setDoc } from "firebase/firestore";
import { Trophy, Plus, Check } from "lucide-react";

export function useTournament() {
  const [tournaments, setTournaments] = useState([]);
  const [activeTournament, setActiveTournament] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchTournaments = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "tournaments"));
        const list = [];
        querySnapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() });
        });

        if (list.length > 0) {
          setTournaments(list);
          const savedActiveId = localStorage.getItem("active_tournament_id");
          const found = list.find(t => t.id === savedActiveId);
          setActiveTournament(found || list[0]);
        } else {
          // Create a default tournament if none exist
          const docRef = await addDoc(collection(db, "tournaments"), {
            name: "Summer Championship 2026",
            createdAt: new Date().toISOString()
          });
          const defaultT = { id: docRef.id, name: "Summer Championship 2026" };
          setTournaments([defaultT]);
          setActiveTournament(defaultT);
          localStorage.setItem("active_tournament_id", docRef.id);
        }
      } catch (error) {
        console.error("Error fetching tournaments:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTournaments();
  }, []);

  const switchTournament = (tournamentId) => {
    const found = tournaments.find(t => t.id === tournamentId);
    if (found) {
      setActiveTournament(found);
      localStorage.setItem("active_tournament_id", found.id);
    }
  };

  const createTournament = async (name) => {
    if (!name.trim()) return;
    try {
      const docRef = await addDoc(collection(db, "tournaments"), {
        name: name.trim(),
        createdAt: new Date().toISOString()
      });
      const newT = { id: docRef.id, name: name.trim() };
      setTournaments(prev => [...prev, newT]);
      setActiveTournament(newT);
      localStorage.setItem("active_tournament_id", newT.id);
    } catch (error) {
      console.error("Error creating tournament:", error);
    }
  };

  return { tournaments, activeTournament, switchTournament, createTournament, isLoading };
}