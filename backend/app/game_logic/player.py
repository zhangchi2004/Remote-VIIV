from typing import List, Optional
from dataclasses import dataclass, field
from .card import Card

@dataclass
class Player:
    id: str
    name: str
    team_id: int  # 0, 1, or 2 (Since 3 groups of 2)
    hand: List[Card] = field(default_factory=list)
    
    # Track collected points just for visual aid, though points usually belong to the outcome of the trick
    collected_points: int = 0 

    def receive_cards(self, cards: List[Card]):
        self.hand.extend(cards)
        # self.sort_hand() # Do not sort, keep deal order for streaming

    def remove_cards(self, card_ids: List[str]) -> List[Card]:
        removed = []
        new_hand = []
        for card in self.hand:
            if card.id in card_ids:
                removed.append(card)
            else:
                new_hand.append(card)
        self.hand = new_hand
        return removed

    def sort_hand(self):
        # Default sort, can be enhanced later for UI convenience
        # Sort by Suit then Rank
        self.hand.sort(key=lambda c: (c.suit.value, c.rank.value), reverse=True)

    def has_cards(self, card_ids: List[str]) -> bool:
        hand_ids = {c.id for c in self.hand}
        return all(cid in hand_ids for cid in card_ids)
