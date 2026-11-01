package de.appshelf.leistenplan;

import org.junit.Test;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Random;
import static org.junit.Assert.*;

public final class CuttingPlannerTest {
    private CuttingPlanner.Plan plan(String stock,String kerf,String parts) { return CuttingPlanner.plan(CuttingPlanner.parse(stock,kerf,parts)); }
    private void invalid(String stock,String kerf,String parts) { assertThrows(IllegalArgumentException.class,()->plan(stock,kerf,parts)); }
    @Test public void uncutStockNeedsNoCutOrLoss() { CuttingPlanner.Plan p=plan("1000","3","1000"); assertEquals(1,p.boards.size());assertEquals(0,p.loss);assertEquals(0,p.offcut);assertEquals(0,p.boards.get(0).cuts); }
    @Test public void exactFitIncludesTheGapBetweenParts() { CuttingPlanner.Plan p=plan("1000","3","500\n497");assertEquals(1,p.boards.size());assertEquals(30,p.loss);assertEquals(0,p.offcut);assertEquals(1,p.boards.get(0).cuts); }
    @Test public void ignoringKerfWouldProduceAnImpossiblePlan() { CuttingPlanner.Plan p=plan("1000","3","500 x 2");assertEquals(2,p.boards.size());assertEquals(60,p.loss);assertEquals(9940,p.offcut); }
    @Test public void finalSeparatingCutIsNotReportedAsReusableOffcut() { CuttingPlanner.Plan p=plan("1000","3","600");assertEquals(3970,p.offcut);assertEquals(30,p.loss);assertEquals(1,p.boards.get(0).cuts); }
    @Test public void thinTailOnlyLosesMaterialThatActuallyExists() { CuttingPlanner.Plan p=plan("1000","3","999,9");assertEquals(0,p.offcut);assertEquals(1,p.loss);assertEquals(1,p.boards.get(0).cuts); }
    @Test public void decimalCommaAndPointAreExactNotFloatingPoint() { CuttingPlanner.Request r=CuttingPlanner.parse("1000.0","2,5","25,5 x 2\n9.1");assertEquals(10000,r.stock);assertEquals(25,r.kerf);assertEquals(java.util.Arrays.asList(255,255,91),r.parts); }
    @Test public void quantitiesAndBlankLinesAreHandled() { CuttingPlanner.Request r=CuttingPlanner.parse("1000","0","\n100 × 3\r\n\n200 X 2\n");assertEquals(5,r.parts.size());assertEquals(7000,plan("1000","0","100 × 3\n200 X 2").requiredLength); }
    @Test public void exampleProducesTwoFeasibleBoards() { CuttingPlanner.Plan p=plan("2500","3","1200 x 2\n600 x 2\n400 x 2");assertEquals(2,p.boards.size());assertEquals(44000,p.requiredLength);assertEquals(180,p.loss);assertEquals(5820,p.offcut); }
    @Test public void zeroKerfCanFillAStockExactly() { CuttingPlanner.Plan p=plan("1000","0","500 x 2");assertEquals(1,p.boards.size());assertEquals(0,p.loss);assertEquals(0,p.offcut); }
    @Test public void emptyProjectIsNotAZeroBoardSuccess() { invalid("1000","3","");invalid("1000","3","\n \n"); }
    @Test public void negativeOrZeroLengthsAreRejected() { invalid("0","3","1");invalid("-5","3","1");invalid("1000","3","0");invalid("1000","3","-2"); }
    @Test public void negativeOrOversizedKerfIsRejected() { invalid("1000","-1","1");invalid("1000","20,1","1");invalid("1","2","1"); }
    @Test public void overlongPieceIsRejectedBeforePlanning() { invalid("1000","3","1000,1"); }
    @Test public void quantitiesAreBoundedAndPositive() { invalid("1000","3","10 x 0");invalid("1000","3","10 x -2");invalid("1000","3","10 x 101");invalid("1000","3","10 x 60\n20 x 41"); }
    @Test public void totalOfOneHundredPartsIsAccepted() { assertEquals(100,plan("1000","3","10 x 100").request.parts.size()); }
    @Test public void malformedDimensionsAreRejected() { for(String s:new String[]{"NaN","Infinity","1e3","1,23","1.2.3","one",""})invalid(s,"3","1"); }
    @Test public void overflowAndMalformedRowsGiveValidationErrors() { invalid("999999999999999999999","3","1");invalid("1000","3","1 x 2 x 3");invalid("1000","3","1 x");invalid("1000","3","1;2"); }
    @Test public void rowLimitPreventsUnboundedWork() { invalid("1000","3",String.join("\n",Collections.nCopies(21,"1"))); }
    @Test public void shareTextContainsRealTotalsAndLimitations() { String text=plan("1000","3","500\n497").asText();assertTrue(text.contains("1 Leiste · 2 Abschnitte"));assertTrue(text.contains("Schnittverlust gesamt: 3 mm"));assertTrue(text.contains("nicht garantiert optimal")); }
    @Test public void randomizedPlansPreserveEveryPartAndMaterial() {
        Random random=new Random(8122026);
        for(int example=0;example<300;example++) {
            int stock=100+random.nextInt(3900),kerf=random.nextInt(11),count=1+random.nextInt(20);
            StringBuilder lines=new StringBuilder();for(int n=0;n<count;n++)lines.append(1+random.nextInt(stock)).append('\n');
            CuttingPlanner.Request request=CuttingPlanner.parse(Integer.toString(stock),Integer.toString(kerf),lines.toString());
            CuttingPlanner.Plan p=CuttingPlanner.plan(request);List<Integer> actual=new ArrayList<>();
            for(CuttingPlanner.Board b:p.boards) { int sum=0;for(int n:b.parts){sum+=n;actual.add(n);}assertTrue(sum+(b.parts.size()-1)*request.kerf<=request.stock);assertTrue(b.loss>=0);assertTrue(b.offcut>=0);assertEquals(request.stock,sum+b.loss+b.offcut); }
            List<Integer> expected=new ArrayList<>(request.parts);Collections.sort(expected);Collections.sort(actual);assertEquals(expected,actual);
            assertEquals((long)p.boards.size()*request.stock,p.requiredLength+p.loss+p.offcut);assertEquals(p.asText(),CuttingPlanner.plan(request).asText());
        }
    }
}
