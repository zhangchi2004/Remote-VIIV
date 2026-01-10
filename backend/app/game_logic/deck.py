import random
import uuid
from typing import List
from .card import Card, Suit, Rank

class Deck:
    def __init__(self):
        self.cards: List[Card] = []
        self._initialize_deck()

    def _initialize_deck(self):
        self.cards = []
        # Create 4 decks
        for _ in range(4):
            # Standard 52 cards
            for suit in [Suit.SPADES, Suit.HEARTS, Suit.CLUBS, Suit.DIAMONDS]:
                for rank in range(2, 15): # 2 to Ace (14)
                    self.cards.append(Card(suit=suit, rank=Rank(rank), id=str(uuid.uuid4())))
            
            # Jokers
            self.cards.append(Card(suit=Suit.JOKER, rank=Rank.SMALL_JOKER, id=str(uuid.uuid4())))
            self.cards.append(Card(suit=Suit.JOKER, rank=Rank.BIG_JOKER, id=str(uuid.uuid4())))
            
        assert len(self.cards) == 216

    def shuffle(self):
        random.shuffle(self.cards)

    def draw(self, count: int) -> List[Card]:
        if count > len(self.cards):
            raise ValueError("Not enough cards using deck")
        drawn = self.cards[:count]
        self.cards = self.cards[count:]
        return drawn

    def peek(self, count: int) -> List[Card]:
        return self.cards[:count]
