# Six-Player Shengji Poker (六人四副滚子)

A web-based implementation of the 6-player, 4-deck variant of the popular Chinese card game "Shengji" (Upgrades), specifically the "Gunzi" (滚子) ruleset.

This project consists of a Python FastAPI backend and a React/Vite frontend.

## Project Structure

- `backend/`: FastAPI application handling game logic, state management, and rules enforcement.
- `frontend/`: React application using Vite, TailwindCSS, and WebSockets for real-time game interaction.

## Prerequisites

- **Python**: 3.8+
- **Node.js**: 16+
- **Package Manager**: `pip` (for Python) and `pnpm` (or npm/yarn) for Node.js.

## Setup & Running

### 1. Backend Setup

Open a terminal and navigate to the `backend` directory:

```bash
cd backend
```

Create a virtual environment (optional but recommended):
```bash
python -m venv venv
source venv/bin/activate  # On Windows use: venv\Scripts\activate
```

Install dependencies:
```bash
pip install -r requirements.txt
```

Run the server:
```bash
uvicorn app.main:app --reload
```
The backend API will run at `http://127.0.0.1:8000`.

### 2. Frontend Setup

Open a **new** terminal window and navigate to the `frontend` directory:

```bash
cd frontend
```

Install dependencies:
```bash
# If you don't have pnpm installed: npm install -g pnpm
pnpm install
```

Run the development server:
```bash
pnpm dev
```
The frontend will open at `http://localhost:5173` (or similar).

## How to Play (Debug Mode)

Since this game requires 6 players, the project includes a "God Mode" for easier testing and development.

1.  Open the frontend URL (`http://localhost:5173`).
2.  Enter a Room Name (e.g., `test`) and your Player Name.
3.  Click **"Create & Join"**.
4.  In the game room header, click the green **"+ 5 Bots (Debug)"** button. This will simulate 5 additional players joining the room.
5.  Click **"Start Game"** to begin dealing cards.

### Game Controls

-   **Multi-View**: You can switch between any of the 6 players by clicking their name tabs at the top of the screen.
-   **Drawing Phase**: New cards appear automatically. Select cards and click "Declare Main" to call the main suit (Liang Zhu).
-   **Exchange Phase**: If you are the Dealer, switch to your tab. You will receive the bottom cards and must select 6 cards to discard.
-   **Playing Phase**:
    -   Select cards from your hand and click "Play Selected".
    -   The system enforces detailed rules (Suit Following, Dead Stick Rule). Illegal moves will trigger an alert.
    -   The table view shows played cards in a 2x3 grid, always rotating so "Me" is at the bottom center.

## Rules Implementation

-   **4 Decks **: 216 cards total.
-   **Dead Stick (死棒)**: The backend and frontend enforce strict structure following rules (e.g., if a Pair is led, you must follow with a Pair if you have one).
-   **Scoring**: Real-time tracking of Dealer Team vs. Catching Teams scores.
-   **Kou Di (抠底)**: Automatic calculation of bottom card points multiplier at the end of the game.