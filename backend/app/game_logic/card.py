from enum import Enum, IntEnum
from dataclasses import dataclass
from typing import List, Optional

class Suit(str, Enum):
    SPADES = "♠"
    HEARTS = "♥"
    CLUBS = "♣"
    DIAMONDS = "♦"
    JOKER = "JOKER"

class Rank(IntEnum):
    TWO = 2
    THREE = 3
    FOUR = 4
    FIVE = 5
    SIX = 6
    SEVEN = 7
    EIGHT = 8
    NINE = 9
    TEN = 10
    JACK = 11
    QUEEN = 12
    KING = 13
    ACE = 14
    SMALL_JOKER = 15
    BIG_JOKER = 16

class CardType(IntEnum):
    SUB_CARD = 0        # 副牌
    MAIN_SUIT_CARD = 1  # 主花色牌 (非级牌，非2)
    SUB_TWO = 2         # 副牌2
    MAIN_TWO = 3        # 主花色2
    SUB_LEVEL = 4       # 副牌级牌
    MAIN_LEVEL = 5      # 主花色级牌
    SMALL_JOKER = 6     # 小王
    BIG_JOKER = 7       # 大王

@dataclass
class Card:
    suit: Suit
    rank: Rank
    # Unique ID to distinguish identical cards from 4 decks
    id: str 

    def get_points(self) -> int:
        if self.rank == Rank.FIVE:
            return 5
        if self.rank == Rank.TEN:
            return 10
        if self.rank == Rank.KING:
            return 10
        return 0

    def get_effective_type(self, main_suit: Optional[Suit], current_level: int) -> CardType:
        """
        Determine the effective type (level of power) of the card 
        given the current main suit and level.
        """
        if self.rank == Rank.BIG_JOKER:
            return CardType.BIG_JOKER
        if self.rank == Rank.SMALL_JOKER:
            return CardType.SMALL_JOKER
        
        # Level cards (Jokers are handled above)
        if self.rank == current_level:
            if self.suit == main_suit:
                return CardType.MAIN_LEVEL
            else:
                return CardType.SUB_LEVEL
        
        # Twos
        if self.rank == Rank.TWO:
            if self.suit == main_suit:
                return CardType.MAIN_TWO
            else:
                return CardType.SUB_TWO
        
        # Regular Main Suit
        if self.suit == main_suit:
            return CardType.MAIN_SUIT_CARD
            
        return CardType.SUB_CARD

    def is_main(self, main_suit: Optional[Suit], current_level: int) -> bool:
        return self.get_effective_type(main_suit, current_level) > CardType.SUB_CARD

    def __repr__(self):
        return f"{self.suit.value}{self.rank.name}"

    def __eq__(self, other):
        if not isinstance(other, Card):
            return False
        return self.suit == other.suit and self.rank == other.rank
