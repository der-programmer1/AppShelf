package de.appshelf.leistenplan;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

/** Pure, deterministic 1D planner. Lengths are integer tenths of a millimetre. */
public final class CuttingPlanner {
    private CuttingPlanner() {}
    public static final int MAX_PARTS = 100;

    public static final class Request {
        public final int stock, kerf;
        public final List<Integer> parts;
        private Request(int stock, int kerf, List<Integer> parts) {
            this.stock = stock;
            this.kerf = kerf;
            this.parts = Collections.unmodifiableList(new ArrayList<>(parts));
        }
    }

    public static Request parse(String stockText, String kerfText, String partsText) {
        int stock = dimension(stockText, "Rohlänge", false, 1_000_000);
        int kerf = dimension(kerfText, "Schnittbreite", true, 200);
        if (kerf > stock) throw new IllegalArgumentException("Die Schnittbreite darf nicht größer als die Rohlänge sein.");
        List<Integer> parts = new ArrayList<>();
        int row = 0, nonempty = 0;
        for (String raw : (partsText == null ? "" : partsText).split("\\r?\\n", -1)) {
            row++;
            String line = raw.trim();
            if (line.isEmpty()) continue;
            if (++nonempty > 20) throw new IllegalArgumentException("Bitte höchstens 20 ausgefüllte Zeilen verwenden.");
            String[] values = line.split("\\s*[xX×]\\s*", -1);
            if (values.length > 2) throw new IllegalArgumentException("Zeile " + row + ": Bitte Länge oder Länge x Anzahl eingeben.");
            int length = dimension(values[0], "Zeile " + row + " – Länge", false, 1_000_000);
            if (length > stock) throw new IllegalArgumentException("Zeile " + row + ": Der Abschnitt ist länger als die Rohlänge.");
            int count = 1;
            if (values.length == 2) {
                String quantity = values[1].trim();
                if (!quantity.matches("[1-9][0-9]{0,2}")) throw new IllegalArgumentException("Zeile " + row + ": Die Anzahl muss zwischen 1 und 100 liegen.");
                count = Integer.parseInt(quantity);
            }
            if (count > MAX_PARTS || parts.size() + count > MAX_PARTS) throw new IllegalArgumentException("Ein Projekt darf höchstens 100 Abschnitte enthalten.");
            for (int i = 0; i < count; i++) parts.add(length);
        }
        if (parts.isEmpty()) throw new IllegalArgumentException("Bitte mindestens einen Abschnitt eingeben, zum Beispiel 600 x 2.");
        return new Request(stock, kerf, parts);
    }

    private static int dimension(String raw, String label, boolean zeroAllowed, int max) {
        String value = raw == null ? "" : raw.trim();
        if (!value.matches("[0-9]+([.,][0-9])?")) throw new IllegalArgumentException(label + ": Bitte Millimeter mit höchstens einer Nachkommastelle eingeben.");
        final int result;
        try {
            result = new BigDecimal(value.replace(',', '.')).movePointRight(1).intValueExact();
        } catch (ArithmeticException | NumberFormatException ex) {
            throw new IllegalArgumentException(label + ": Der Wert ist zu groß.");
        }
        if (result < (zeroAllowed ? 0 : 1) || result > max) throw new IllegalArgumentException(label + ": Erlaubt sind " + (zeroAllowed ? "0" : "0,1") + " bis " + format(max) + " mm.");
        return result;
    }

    public static final class Board {
        public final List<Integer> parts;
        public final int offcut, loss, cuts;
        private Board(List<Integer> parts, int stock, int kerf) {
            this.parts = Collections.unmodifiableList(new ArrayList<>(parts));
            int sum = 0;
            for (int length : parts) sum += length;
            int occupied = sum + (parts.size() - 1) * kerf;
            int tail = stock - occupied;
            // A remaining tail needs a final separating cut. If it is thinner than
            // the blade, only that material is lost; the rest of the blade is in air.
            offcut = Math.max(0, tail - kerf);
            loss = stock - sum - offcut;
            cuts = parts.size() - 1 + (tail > 0 ? 1 : 0);
        }
    }

    public static final class Plan {
        public final Request request;
        public final List<Board> boards;
        public final long requiredLength, offcut, loss;
        private Plan(Request request, List<Board> boards) {
            this.request = request;
            this.boards = Collections.unmodifiableList(new ArrayList<>(boards));
            long total = 0, remainder = 0, kerfLoss = 0;
            for (int part : request.parts) total += part;
            for (Board board : boards) { remainder += board.offcut; kerfLoss += board.loss; }
            requiredLength = total; offcut = remainder; loss = kerfLoss;
        }
        public String summary() {
            return boards.size() + (boards.size() == 1 ? " Leiste" : " Leisten") + " · " + request.parts.size() + (request.parts.size() == 1 ? " Abschnitt" : " Abschnitte");
        }
        public String asText() {
            StringBuilder out = new StringBuilder("LeistenPlan\n").append(summary()).append("\nRohlänge: ").append(format(request.stock)).append(" mm\nSchnittbreite: ").append(format(request.kerf)).append(" mm\n\n");
            int index = 0;
            for (Board board : boards) {
                out.append("Leiste ").append(++index).append(": ");
                for (int i = 0; i < board.parts.size(); i++) {
                    if (i > 0) out.append(" + ");
                    out.append(format(board.parts.get(i)));
                }
                out.append(" mm\nRest: ").append(format(board.offcut)).append(" mm · Schnittverlust: ").append(format(board.loss)).append(" mm\n\n");
            }
            out.append("Rest gesamt: ").append(format(offcut)).append(" mm\nSchnittverlust gesamt: ").append(format(loss)).append(" mm\n");
            out.append("Verteilungsvorschlag, nicht garantiert optimal. Keine Zugabe für Endbeschnitt, Defekte oder Einspannung. Maße vor Verwendung prüfen.");
            return out.toString();
        }
    }

    private static final class Bin {
        final List<Integer> parts = new ArrayList<>();
        int occupied;
        void add(int length, int kerf) { occupied += length + (parts.isEmpty() ? 0 : kerf); parts.add(length); }
    }

    public static Plan plan(Request request) {
        if (request == null) throw new IllegalArgumentException("Das Projekt fehlt.");
        List<Integer> sorted = new ArrayList<>(request.parts);
        sorted.sort(Comparator.reverseOrder());
        List<Bin> bins = new ArrayList<>();
        for (int length : sorted) {
            if (Thread.currentThread().isInterrupted()) throw new IllegalStateException("Berechnung abgebrochen.");
            Bin best = null;
            int remainingBest = Integer.MAX_VALUE;
            for (Bin bin : bins) {
                int remaining = request.stock - bin.occupied - request.kerf - length;
                if (remaining >= 0 && remaining < remainingBest) { best = bin; remainingBest = remaining; }
            }
            if (best == null) { best = new Bin(); bins.add(best); }
            best.add(length, request.kerf);
        }
        List<Board> result = new ArrayList<>();
        for (Bin bin : bins) result.add(new Board(bin.parts, request.stock, request.kerf));
        return new Plan(request, result);
    }

    public static String format(long tenths) {
        return tenths / 10 + (tenths % 10 == 0 ? "" : "," + tenths % 10);
    }
}
