"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, addDoc } from "firebase/firestore";

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
          // NO MORE AUTO-CREATION. 
          // If the database is empty, leave it empty until the Admin creates one.
          setTournaments([]);
          setActiveTournament(null);
          localStorage.removeItem("active_tournament_id");
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