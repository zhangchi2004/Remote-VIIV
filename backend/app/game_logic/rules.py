from typing import List, Optional, Tuple, Dict
from collections import Counter
from .card import Card, CardType, Suit, Rank
from enum import Enum

class MoveType(str, Enum):
    SINGLE = "SINGLE"
    PAIR = "PAIR"
    TRIPLE = "TRIPLE"
    QUAD = "QUAD"
    INVALID = "INVALID"

class Rules:
    @staticmethod
    def classify_move(cards: List[Card]) -> MoveType:
        if len(cards) == 0:
            return MoveType.INVALID
        
        # Check if all cards are identical in Rank and Suit
        first = cards[0]
        for c in cards[1:]:
            if c.rank != first.rank or c.suit != first.suit:
                return MoveType.INVALID
        
        if len(cards) == 1:
            return MoveType.SINGLE
        elif len(cards) == 2:
            return MoveType.PAIR
        elif len(cards) == 3:
            return MoveType.TRIPLE
        elif len(cards) == 4:
            return MoveType.QUAD
        
        return MoveType.INVALID

    @staticmethod
    def get_card_suit_for_rules(card: Card, main_suit: Optional[Suit], current_level: int) -> str:
        """
        Returns the 'Logic Suit' of the card.
        All Main cards (Jokers, Level Cards, Main 2, Main Suit) belong to the 'MAIN' bucket.
        Sub cards belong to their natural suit.
        """
        if card.is_main(main_suit, current_level):
            return "MAIN"
        return card.suit.value

    @staticmethod
    def validate_lead_turn(cards: List[Card]) -> bool:
        """
        Rule 8.4: Leader can only play Single, Pair, Triple, or Quad.
        """
        return Rules.classify_move(cards) != MoveType.INVALID

    @staticmethod
    def validate_follow_turn(
        leader_cards: List[Card], 
        follower_cards: List[Card], 
        follower_hand: List[Card],
        main_suit: Optional[Suit],
        current_level: int
    ) ->Tuple[bool, str]:
        """
        Validates if the follower's move is legal given the leader's move and the follower's hand.
        """
        if len(follower_cards) != len(leader_cards):
            return False, "Must play same number of cards"

        leader_type = Rules.classify_move(leader_cards)
        if leader_type == MoveType.INVALID:
            return False, "Leader played invalid move (internal error)"

        # 1. Determine the Suit being played
        leader_card_sample = leader_cards[0]
        target_suit_category = Rules.get_card_suit_for_rules(leader_card_sample, main_suit, current_level)

        # 2. Analyze Follower's Hand for that suit
        hand_suit_cards = [
            c for c in follower_hand 
            if Rules.get_card_suit_for_rules(c, main_suit, current_level) == target_suit_category
        ]
        
        # Count available structures in hand for that suit
        # Need to group by exact card identity (Simulated by rank+suit, but strict ID checking was done elsewhere)
        # Actually, for structure detection, we group by (suit, rank)
        hand_structures = Rules._analyze_hand_structures(hand_suit_cards)
        
        # 3. Analyze Played Cards
        played_suit_cards = [
            c for c in follower_cards
            if Rules.get_card_suit_for_rules(c, main_suit, current_level) == target_suit_category
        ]
        
        # Rule 8.3: Must follow suit if possible
        count_in_hand = len(hand_suit_cards)
        count_required = len(leader_cards)
        count_played_matching = len(played_suit_cards)

        # If you have enough of the suit, you must play all of the suit
        if count_in_hand >= count_required:
            if count_played_matching < count_required:
                return False, f"Must play {target_suit_category} suit"
        else:
            # If you don't have enough, you must play all you have
            if count_played_matching < count_in_hand:
                return False, f"Must play all valid {target_suit_category} cards you have"

        # If we are not playing fully into the suit (because we ran out), strict structure rules (Dead Stick) 
        # usually assume you play the structure *within* the suit first.
        # But if we are playing fully matching suit, we enforce Dead Stick (Rule 8.5)
        
        if count_played_matching == count_required:
            # We are following suit completely. Check Dead Stick Rule.
            # "When leader plays Bomb (4), others have Bomb play Bomb, else Triple, else Pair, else Single"
            
            # The rule is hierarchically protecting the highest structures.
            # If Leader is QUAD:
            if leader_type == MoveType.QUAD:
                if Rules._check_missing_structure(follower_cards, hand_structures, 4):
                    return False, "Must play Quad (Zhazi) if available"
                if Rules._check_missing_structure(follower_cards, hand_structures, 3) and not Rules._has_structure(follower_cards, 4):
                     # Wait, logic is: "If no Bomb, play Gun (Triple)". 
                     # This means if you DIDNT play a Bomb, you better not have one.
                     # AND if you didn't play a bomb, but played a Triple?
                     # The rule implies: Your played cards *must* prioritize the highest matching structure.
                     return False, "Must play Triple (Gunzi) if available"
                # ... and so on for Pair.
                
            # Simplified Logic for 8.5 Dead Stick:
            # You must match the structure of the leader IF you have it.
            # If Leader is QUAD, you must play QUAD.
            # If Leader is TRIPLE, you must play TRIPLE.
            # If Leader is PAIR, you must play PAIR.
            
            # Additional nuance: "Leader plays Bomb... if no Bomb, follow Triple".
            # This is a cascade.
            # Target Order: [4, 3, 2, 1] for QUAD lead.
            # Target Order: [3, 2, 1] for TRIPLE lead.
            # Target Order: [2, 1] for PAIR lead.
            
            check_order = []
            if leader_type == MoveType.QUAD:
                check_order = [4, 3, 2]
            elif leader_type == MoveType.TRIPLE:
                check_order = [3, 2]
            elif leader_type == MoveType.PAIR:
                check_order = [2]
            
            # Calculate structure of what was actually played
            played_counts = Counter()
            for c in follower_cards:
                 played_counts[(c.suit, c.rank)] += 1
            max_played_structure = max(played_counts.values()) if played_counts else 0

            # Iterate down the requirement list
            for req_size in check_order:
                start_checking = False
                # If we were required to play something bigger but didn't (because we didn't have it),
                # we drop to this level.
                
                # If we HAVE this structure in hand, did we play it?
                has_in_hand = any(cnt >= req_size for cnt in hand_structures.values())
                
                if has_in_hand:
                    # We have a set of size `req_size`.
                    # We must assume the player should have played it if they didn't play something BETTER.
                    # Example: Lead 4. I have 4. I play 4. max_played = 4. OK.
                    # Lead 4. I have 3. I play 3. max_played = 3. OK.
                    # Lead 4. I have 4. I play 3. max_played = 3. FAIL.
                    
                    if max_played_structure < req_size:
                         # We verified in previous iterations that we didn't have larger stuff 
                         # (Logic handles this implicitly if we iterate large to small)
                         # Wait, this loop logic is tricky.
                         
                         # Let's simplify:
                         # Use the "Best Available" vs "Actual Played" comparison.
                         best_available = 1
                         for size in check_order: # e.g. 4, 3, 2
                             if any(cnt >= size for cnt in hand_structures.values()):
                                 best_available = size
                                 break # found the highest we can matching the cascade requirements
                        
                         # But wait, the list is conditional.
                         # "If leader is Quad": Check 4. If have 4, MUST play 4.
                         # If NO 4, Check 3. If have 3, MUST play 3.
                         # If NO 3, Check 2. If have 2, MUST play 2.
                         
                         required_to_play = 1 # Default
                         for size in check_order:
                             if any(cnt >= size for cnt in hand_structures.values()):
                                 required_to_play = size
                                 break
                         
                         # Now check if played cards satisfy this.
                         # If `required_to_play` is 4, we must have played a 4.
                         # If `required_to_play` is 3, we must have played a 3.
                         if max_played_structure < required_to_play:
                             return False, f"Dead Stick Rule: Must play set of size {required_to_play} if available."
                         
                         break # If we checked the highest requirement, we are done.

        return True, ""

    @staticmethod
    def _analyze_hand_structures(cards: List[Card]) -> Counter:
        """
        Returns a Counter mapping (suit, rank) -> count
        """
        counts = Counter()
        for c in cards:
            counts[(c.suit, c.rank)] += 1
        return counts

    @staticmethod
    def _check_missing_structure(played_cards: List[Card], hand_structures: Counter, size: int) -> bool:
        """
        Returns True if the player HAS a structure of `size` in hand, but did NOT play it.
        """
        # Logic is complex because playing a 4 counts as playing a 3? 
        # Normally "With bomb follow bomb".
        # If I have a bomb, did I play it?
        
        has_structure = any(cnt >= size for cnt in hand_structures.values())
        if not has_structure:
            return False
            
        # We have it. Did we play it?
        # Check played cards
        played_counts = Counter()
        for c in played_cards:
            played_counts[(c.suit, c.rank)] += 1
        
        played_structure = any(cnt >= size for cnt in played_counts.values())
        return not played_structure

    @staticmethod
    def compare_turn(
        moves: List[Tuple[int, List[Card]]], 
        main_suit: Optional[Suit], 
        current_level: int
    ) -> int:
        """
        Returns the index of the winning move in the `moves` list.
        moves: List of (player_index, cards_played)
        Assumes moves are validated.
        Rule 3: Big Joker > Small Joker > Main Level > Sub Level > ...
        Rule 8.3: First player determines the suit. To win, you must match suit or play Main Kill.
        """
        if not moves:
            return -1

        leader_idx, leader_cards = moves[0]
        leader_type = Rules.classify_move(leader_cards)
        leader_suit_cat = Rules.get_card_suit_for_rules(leader_cards[0], main_suit, current_level)
        
        winning_idx = 0
        best_cards = leader_cards
        
        for i in range(1, len(moves)):
            challenger_idx, challenger_cards = moves[i]
            challenger_suit_cat = Rules.get_card_suit_for_rules(challenger_cards[0], main_suit, current_level)
            
            # If leader is NOT Main, and Challenger IS Main, Challenger might kill.
            # Condition for killing:
            # 1. Leader played Side Suit.
            # 2. Challenger played Main Suit.
            # 3. Challenger played exact same structure (Singles, Pairs, Triples, Quads).
            #    (Rule 8.3 says "can throw main cards to kill" - usually implies matching structure).
            
            is_kill = (leader_suit_cat != "MAIN" and challenger_suit_cat == "MAIN")
            is_follow = (challenger_suit_cat == leader_suit_cat)
            
            if not is_kill and not is_follow:
                continue # Discard / Dian Pai - cannot win
                
            # If structure doesn't match, strictly speaking in many chinese upgrades you can't win unless structure matches or you bomb?
            # Rule 8.3: "use main card to kill". It doesn't explicitly say you must match structure, but usually 
            # you must kill a pair with a pair, etc.
            # "Rules 8.5" defines dead stick for following.
            # Let's assume standard Shengji rules: Must match card count and structure type to beat.
            
            challenger_type = Rules.classify_move(challenger_cards)
            
            if challenger_type != leader_type:
                # If they played different structures, generally the leader keeps advantage unless specific bomb rules apply.
                # But this game has only 4 types. 
                # If Leader plays Pair, and I play Triple Main? Usually that's just "Two Main and One trash".
                # Standard rule: Must match structure (Pair vs Pair).
                continue
                
            # Now compare power
            # We need a strict power value function
            if Rules.is_stronger(challenger_cards, best_cards, main_suit, current_level):
                winning_idx = i
                best_cards = challenger_cards
                
        return winning_idx

    @staticmethod
    def get_card_power_score(card: Card, main_suit: Optional[Suit], current_level: int) -> int:
        """
        Helper for strict comparison based on Rule 3.
        Returns a comparable integer (Higher is better).
        """
        c_type = card.get_effective_type(main_suit, current_level)
        
        # Base Scores for Types
        # Sub Card: 0-100
        # Main Suit: 200-300
        # Sub 2: 400
        # Main 2: 500
        # Sub Level: 600
        # Main Level: 700
        # Small Joker: 800
        # Big Joker: 900
        
        score = 0
        if c_type == CardType.BIG_JOKER:
            score = 900
        elif c_type == CardType.SMALL_JOKER:
            score = 800
        elif c_type == CardType.MAIN_LEVEL:
            score = 700
        elif c_type == CardType.SUB_LEVEL:
            score = 600
        elif c_type == CardType.MAIN_TWO:
            score = 500
        elif c_type == CardType.SUB_TWO:
            score = 400
        elif c_type == CardType.MAIN_SUIT_CARD:
            score = 200 + card.rank.value
        else: # Sub Card
            score = card.rank.value
            
        return score

    @staticmethod
    def is_stronger(challenger: List[Card], defender: List[Card], main_suit: Optional[Suit], current_level: int) -> bool:
        # Assumes same structure and same logic suit (or challenger is killing sub with main)
        # Compare the first card (since they are identical structure)
        val_c = Rules.get_card_power_score(challenger[0], main_suit, current_level)
        val_d = Rules.get_card_power_score(defender[0], main_suit, current_level)
        
        if val_c > val_d:
            return True
        elif val_c == val_d:
            # Rule 3: "Same cards, first played > last played".
            # So challenger needs to be STRICTLY greater.
            return False
            
        return False

    @staticmethod
    def calculate_declaration_strength(cards: List[Card], current_level: int) -> int:
        """
        Calculates the strength of a declaration (Liang Zhu / Fan Zhu).
        Returns an integer representation of strength. 0 if invalid.
        
        Rule 5.4:
        - 1 Level Card: Strength 1
        - 2 Level Cards: Strength 2
        - 3 Level Cards: Strength 3
        - 4 Level Cards: Strength 4
        
        Jokers (Rule 5.4):
        - 3 Small Jokers: Strength 10 (Can call any/wuzhu) - Arbitrary High Value
        - 3 Big Jokers: Strength 12
        - 4 Small Jokers: Strength 14 (Extrapolated logic: 4 > 3)
        - 4 Big Jokers: Strength 16
        
        Note: The rule says "Great Jokers > Small Jokers".
        "3 Small or 3 Big"
        "2 identical counters 1". "3 counters 2 or 1".
        
        Let's map strictly:
        Single Level: 10
        Pair Level: 20
        Triple Level: 30
        Quad Level: 40
        
        Triple Small Joker: 50
        Triple Big Joker: 60
        Quad Small Joker: 70
        Quad Big Joker: 80
        """
        if not cards:
            return 0
            
        first = cards[0]
        # Check all identical
        # Note: For Jokers, they might be distinct instances but same rank/suit
        for c in cards[1:]:
            if c.rank != first.rank or c.suit != first.suit:
                return 0
                
        count = len(cards)
        
        # Level Cards
        if first.rank == current_level:
            return count * 10
            
        # Jokers
        if first.rank == Rank.SMALL_JOKER:
            if count >= 3:
                return 50 + (count - 3) * 20 # 3->50, 4->70
        
        if first.rank == Rank.BIG_JOKER:
            if count >= 3:
                return 60 + (count - 3) * 20 # 3->60, 4->80
                
        # Invalid validation
        return 0
