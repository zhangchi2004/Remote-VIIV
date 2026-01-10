import { Card, Rank, Suit } from './types';

export enum MoveType {
    SINGLE = "SINGLE",
    PAIR = "PAIR",
    TRIPLE = "TRIPLE",
    QUAD = "QUAD",
    INVALID = "INVALID"
}

export class GameLogic {
    static isMain(card: Card, mainSuit: Suit | null, currentLevel: number): boolean {
        if (card.rank === Rank.BIG_JOKER || card.rank === Rank.SMALL_JOKER) return true;
        if (card.rank === currentLevel) return true;
        if (card.rank === Rank.TWO) return true;
        if (mainSuit && card.suit === mainSuit) return true;
        return false;
    }

    static getEffectiveSuit(card: Card, mainSuit: Suit | null, currentLevel: number): string {
        if (this.isMain(card, mainSuit, currentLevel)) {
            return "MAIN";
        }
        return card.suit;
    }

    static classifyMove(cards: Card[]): MoveType {
        if (cards.length === 0) return MoveType.INVALID;
        
        // Check identical
        const first = cards[0];
        for (let i = 1; i < cards.length; i++) {
            if (cards[i].rank !== first.rank || cards[i].suit !== first.suit) {
                return MoveType.INVALID;
            }
        }

        if (cards.length === 1) return MoveType.SINGLE;
        if (cards.length === 2) return MoveType.PAIR;
        if (cards.length === 3) return MoveType.TRIPLE;
        if (cards.length === 4) return MoveType.QUAD;
        
        return MoveType.INVALID;
    }

    static validateLeadTurn(cards: Card[]): boolean {
        return this.classifyMove(cards) !== MoveType.INVALID;
    }

    static validateFollowTurn(
        leaderCards: Card[],
        playedCards: Card[],
        hand: Card[],
        mainSuit: Suit | null,
        currentLevel: number
    ): { valid: boolean; message: string } {
        if (playedCards.length !== leaderCards.length) {
            return { valid: false, message: "Must play same number of cards" };
        }

        const leaderType = this.classifyMove(leaderCards);
        // Determine Leader's effective suit
        // Note: Leader cards are strings in the 'trick' usually, but here we assume we have Card objects?
        // The frontend 'trickCards' currently stores strings (from my previous code).
        // We need to ensure we pass Card objects to this function.
        const targetSuit = this.getEffectiveSuit(leaderCards[0], mainSuit, currentLevel);

        // Analyze Hand for Target Suit
        const handSuitCards = hand.filter(c => 
            this.getEffectiveSuit(c, mainSuit, currentLevel) === targetSuit
        );

        const playedSuitCards = playedCards.filter(c => 
            this.getEffectiveSuit(c, mainSuit, currentLevel) === targetSuit
        );

        const countInHand = handSuitCards.length;
        const countRequired = leaderCards.length; // e.g. 2 for Pair
        const countPlayedMatching = playedSuitCards.length;

        // 1. Must follow suit quantity
        if (countInHand >= countRequired) {
            if (countPlayedMatching < countRequired) {
                return { valid: false, message: `Must play ${targetSuit} suit` };
            }
        } else {
            // Must play all you have
            if (countPlayedMatching < countInHand) {
                return { valid: false, message: `Must play all valid ${targetSuit} cards` };
            }
        }

        // 2. Dead Stick Rule (Strict Structure Matching)
        // Only applies if we are following suit completely
        if (countPlayedMatching === countRequired) {
            // Analyze structures in hand
            const handStructures = this.analyzeStructures(handSuitCards);
            
            // Check based on leader type
            let checkOrder: number[] = [];
            if (leaderType === MoveType.QUAD) checkOrder = [4, 3, 2];
            else if (leaderType === MoveType.TRIPLE) checkOrder = [3, 2];
            else if (leaderType === MoveType.PAIR) checkOrder = [2];

            // Analyze what was actually played (structure-wise)
            const playedStructures = this.analyzeStructures(playedCards);
            // Since playCards are identical (validated elsewhere for structure?), 
            // actually classifyMove ensures they are identical structure if it returns valid type.
            // But player might play 2 singles as a pair?
            // Wait, classifyMove checks if they are IDENTICAL cards.
            // If I play (Main 3 Hearts, Main 3 Spades) -> They are NOT identifying.
            // But they might be a Pair if they are both Main 3?
            // In Shengji, "Pair" implies Identical Suit + Identical Rank.
            // My backend `rules.py` enforces `c.rank != first.rank or c.suit != first.suit`.
            // So "Pair" strictly means 2 identical cards (from different decks).
            
            // So `classifyMove` on playedCards will tell us what structure was played.
            const playedType = this.classifyMove(playedCards);
            let playedSize = 1;
            if (playedType === MoveType.QUAD) playedSize = 4;
            if (playedType === MoveType.TRIPLE) playedSize = 3;
            if (playedType === MoveType.PAIR) playedSize = 2;

            // Iterate down requirements
            for (const reqSize of checkOrder) {
                // Do we have this structure in hand?
                const hasInHand = Array.from(handStructures.values()).some(cnt => cnt >= reqSize);
                
                if (hasInHand) {
                    // We have it. Did we play it?
                    // We must play at least this size (or better, but better is handled by loop order)
                    // If played structure is smaller than reqSize, it's a violation?
                    // Example: Leader Pair (2). I have Pair (2). I play 2 Singles.
                    // My `playedSize` is 1. 1 < 2. Fail.
                    
                    if (playedSize < reqSize) {
                        return { valid: false, message: `Dead Stick: Must play set of size ${reqSize}` };
                    }
                    // If we played it, we satisfied the highest requirement we could. 
                    // Break.
                    break;
                }
            }
        }

        return { valid: true, message: "" };
    }

    private static analyzeStructures(cards: Card[]): Map<string, number> {
        const counts = new Map<string, number>();
        for (const c of cards) {
            const key = `${c.suit}-${c.rank}`;
            counts.set(key, (counts.get(key) || 0) + 1);
        }
        return counts;
    }

    static parseBackendCardString(str: string): { suit: Suit, rank: Rank } | null {
        // Format: "♠TWO", "JOKERSMALL_JOKER" (Wait, __repr__ is suit.value + rank.name)
        // Suit enum values: ♠, ♥, ♣, ♦, JOKER
        
        let suit: Suit | null = null;
        let rankStr = "";
        
        if (str.startsWith("JOKER")) {
            suit = Suit.JOKER;
            rankStr = str.substring(5);
        } else {
            // Check first char for suit symbol
            const sChar = str.substring(0, 1);
            if (sChar === Suit.SPADES) suit = Suit.SPADES;
            else if (sChar === Suit.HEARTS) suit = Suit.HEARTS;
            else if (sChar === Suit.CLUBS) suit = Suit.CLUBS;
            else if (sChar === Suit.DIAMONDS) suit = Suit.DIAMONDS;
            
            if (suit) rankStr = str.substring(1);
        }

        if (!suit) return null;

        // Map rank name to enum
        // Rank keys are "TWO", "THREE" etc.
        const rankEntry = Object.entries(Rank).find(([key, val]) => key === rankStr);
        if (rankEntry) {
             return { suit, rank: rankEntry[1] as Rank };
        }
        return null;
    }
}