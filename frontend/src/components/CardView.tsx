import React from 'react';
import { Card, Suit, Rank } from '../types';
import clsx from 'clsx';

interface Props {
    card: Card;
    selected?: boolean;
    onClick?: () => void;
    small?: boolean;
}

const SUIT_COLORS = {
    [Suit.SPADES]: "text-gray-800",
    [Suit.CLUBS]: "text-green-800", // Green commonly used for Clubs in some online games distinct from Spades
    [Suit.HEARTS]: "text-red-600",
    [Suit.DIAMONDS]: "text-blue-600", // Blue for Diamonds often
    [Suit.JOKER]: "text-purple-600",
};

export const CardView: React.FC<Props> = ({ card, selected, onClick, small }) => {
    const isRed = card.suit === Suit.HEARTS || card.suit === Suit.DIAMONDS;
    
    // Rank Display
    let rankStr = String(card.rank);
    if (card.rank === 11) rankStr = "J";
    if (card.rank === 12) rankStr = "Q";
    if (card.rank === 13) rankStr = "K";
    if (card.rank === 14) rankStr = "A";
    if (card.rank === 15) rankStr = "S.J";
    if (card.rank === 16) rankStr = "B.J";

    return (
        <div 
            onClick={onClick}
            className={clsx(
                "border rounded bg-white shadow flex flex-col items-center justify-center cursor-pointer select-none transition-all",
                small ? "w-8 h-12 text-xs" : "w-16 h-24 text-lg",
                selected ? "border-blue-500 ring-2 ring-blue-300 -translate-y-2" : "border-gray-300 hover:-translate-y-1",
                SUIT_COLORS[card.suit] || "text-black"
            )}
        >
            <div className="font-bold">{rankStr}</div>
            <div className="text-xl">{card.suit !== Suit.JOKER ? card.suit : "🃏"}</div>
        </div>
    );
};