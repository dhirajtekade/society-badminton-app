# Phase 1: Pre-Tournament & Player Onboarding (The Foundation)
Focus: Eliminating the chaos of registration, payment tracking, and finding out who is actually available.

Player Database & Profiles: Bulk upload players or let them register via a simple form. Each player gets a profile (Name, Photo, Category A/Top-Seed or Category B/Noobie).

Availability Polling: Instead of guessing or calling everyone, players click a link to select their available time slots for the weekend.

Registration & Fee Tracker: A simple admin dashboard to check off who has paid their entry fee and who is still pending (solving the mouth-to-mouth entry tracking).

# Phase 2: Matchmaking & Scheduling Engine (The Brain)
Focus: Automating the fixtures, handling the "chits," and assigning exact court times.

The "Fair Play" Generator: A digital randomizer that pairs Category A with Category B players for doubles, replacing the manual spin wheel.

Fixture Automation: One-click generation of the League Groups (e.g., Groups of 3) and the Knockout Bracket (Seed 1 vs Seed 16).

Smart Time Allocator: Assigns exact matches to Court 1 or Court 2 at specific times based on the availability polling from Phase 1.

# Phase 3: Match Day Execution & Live Scoring (The Lifesaver)
Focus: Throwing out the tiny Google Sheets and making match day run on autopilot.

Mobile Scorer UI: A dedicated, full-screen mobile view for the 2 assigned scorers. Huge + and - buttons for points. No typing required.

Live Leaderboard & Walkover Math: As scorers tap points, the leaderboard updates globally in real-time. If a team doesn't show up, hitting a "Walkover" button automatically applies the correct mathematical points (e.g., +21 point difference) so no one has to calculate it manually.

The "Admin Override" (God Mode): The ability to seamlessly swap a missing Player 1 with a substitute Player 3 right before a Quarter Final begins, without crashing the system or deleting the league data.

# Phase 4: Communication Hub & Archives (The Showcase)
Focus: Stopping the endless WhatsApp screenshotting and preserving history.

One-Click WhatsApp Integration: Buttons that automatically generate formatted text schedules and leaderboard summaries to send directly to your WhatsApp groups.

Public Dashboard: A single link players can open on their phones to see the rules PDF, the live scoreboard, and upcoming match times.

Tournament Archive & Gallery: A post-tournament view celebrating the Winners and Runner-ups with their photos, saving all the data and fixtures as a backup template for next year's tournament.

---------------------------

i want to change categories from A and B to say
Intermediate, Average, beginer.
And also rank in admin player roaster.

one major idea i have.
Can we keep players records for future event.
I have bulk upload players for year 2026 and used all of them in year 2026 event.
But i bulk upload new file in year 2027 and I checks with old profile (mhtid) and keep their record as it is and use it. So that previous ranks will be there

----------
drag and drop players in categry or category exchanges
--------
mstches as per availabilty
-----------
admin login
-------
player login
-----
scorer login
----
when player logs in it should check if profile photo available or not and should turn on camera to get pic. player can change it later to upload from gallery later obviously.
--------------
all players data should be kept separate. and tournament wise enrolled players data should kept differently. when generating match fixture it should consider only particular torunament selector and add matches under that tournament. it also mean while importing excel of players for singles or doubles it should also create/ask to give use exisiting tournament name or create new tournament
-----
on admin matches page(or other match fixture page),
we should drag and drop few matches from other date to current date ( this might be needed if player available are these 2 so we can flex the fixture as per current situation)


---
- sometime in doubles partner can be fixed
- players logs in with mhtid to see profile, their matches ranking etc. option to set availability. 
- export sample singles and doubles excel in order to understand what format is needed

- video of how to use each page from website