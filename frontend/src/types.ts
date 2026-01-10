export enum Suit {
    SPADES = "♠",
    HEARTS = "♥",
    CLUBS = "♣",
    DIAMONDS = "♦",
    JOKER = "JOKER"
}

export enum Rank {
    TWO = 2,
    THREE = 3,
    FOUR = 4,
    FIVE = 5,
    SIX = 6,
    SEVEN = 7,
    EIGHT = 8,
    NINE = 9,
    TEN = 10,
    JACK = 11,
    QUEEN = 12,
    KING = 13,
    ACE = 14,
    SMALL_JOKER = 15,
    BIG_JOKER = 16
}

export interface Card {
    id: string;
    suit: Suit;
    rank: Rank;
}

export enum GamePhase {
    WAITING = "WAITING",
    DRAWING = "DRAWING",
    EXCHANGING = "EXCHANGING",
    PLAYING = "PLAYING",
    FINISHED = "FINISHED"
}

export interface PlayerState {
    id: string;
    team: number;
    hand: Card[];
}

export interface GameState {
    gameId: string;
    phase: GamePhase;
    mainSuit: Suit | null;
    currentLevel: number;
    dealerIdx: number;
    currentTurn: number;
    points: {[team: number]: number};
    myPlayerId: string;
}
