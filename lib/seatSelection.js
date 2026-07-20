function seatKey(s) {
  return `${s.row}:${s.seat}`;
}

function chooseSeats(freeSeats, preferredSeats, ticketCount) {
  const freeMap = new Map(freeSeats.map((s) => [seatKey(s), s]));
  const chosen = [];
  const chosenKeys = new Set();

  for (const pref of preferredSeats) {
    if (chosen.length >= ticketCount) break;
    const key = seatKey(pref);
    if (freeMap.has(key) && !chosenKeys.has(key)) {
      chosen.push(freeMap.get(key));
      chosenKeys.add(key);
    }
  }

  if (chosen.length < ticketCount) {
    const remaining = freeSeats
      .filter((s) => !chosenKeys.has(seatKey(s)))
      .slice()
      .sort((a, b) => {
        const priceA = a.price === null || a.price === undefined ? Infinity : a.price;
        const priceB = b.price === null || b.price === undefined ? Infinity : b.price;
        if (priceA !== priceB) return priceA - priceB;
        if (a.row !== b.row) return a.row - b.row;
        return a.seat - b.seat;
      });
    for (const s of remaining) {
      if (chosen.length >= ticketCount) break;
      chosen.push(s);
      chosenKeys.add(seatKey(s));
    }
  }

  return chosen;
}

module.exports = { chooseSeats };
