| phase | durée s | RSS max | RSS fin | heapUsed max | heapTotal max | external max | arrayBuffers max | GC mineur n/ms | GC majeur n/ms | ELD p99 max ms | ELU moy | arbre RSS max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| idle | 60 | 231 | 204 | 96 | 126 | 5 | 1 | 1/1 | 3/26 | 33 | 0.00 | 231 |
| load-1 | 185 | 646 | 641 | 192 | 219 | 28 | 25 | 99/2204 | 14/268 | 433 | 0.04 | 647 |
| load-10 | 186 | 1004 | 937 | 524 | 563 | 62 | 58 | 541/20102 | 21/668 | 719 | 0.29 | 1011 |
| load-25 | 187 | 1119 | 1119 | 613 | 645 | 91 | 87 | 995/38911 | 25/1470 | 670 | 0.60 | 1120 |
| load-50 | 198 | 1231 | 1182 | 678 | 723 | 140 | 136 | 1149/48485 | 32/2076 | 1149 | 0.76 | 1243 |
| cool-T0-c1 | 60 | 1182 | 614 | 219 | 643 | 105 | 102 | 0/0 | 2/187 | 33 | 0.01 | 1183 |
| cool-T1-c1 | 240 | 615 | 615 | 102 | 108 | 5 | 1 | 4/4 | 0/0 | 36 | 0.00 | 616 |
| cool-T5-c1 | 600 | 615 | 615 | 102 | 107 | 5 | 1 | 9/8 | 0/0 | 31 | 0.00 | 616 |
| gc-c1 | 2 | 615 | 615 | 101 | 107 | 5 | 1 | 0/0 | 2/62 | 10 | 0.00 | 616 |
| load-50-cycle2 | 192 | 1292 | 1249 | 721 | 759 | 135 | 132 | 1183/48373 | 35/1921 | 1000 | 0.75 | 1255 |
| cool-T0-c2 | 60 | 1249 | 641 | 451 | 659 | 115 | 43 | 0/0 | 2/172 | 11 | 0.01 | 1250 |

Points instantanés :
idle           rss=230 heapUsed=95 heapTotal=126 ext=5 ab=1 anon=152 file=79
snap-idle      rss=204 heapUsed=91 heapTotal=97 ext=5 ab=1 anon=126 file=79
load-1         rss=204 heapUsed=91 heapTotal=96 ext=5 ab=1 anon=126 file=79
end-load-1     rss=641 heapUsed=178 heapTotal=214 ext=11 ab=7 anon=562 file=80
load-10        rss=641 heapUsed=178 heapTotal=214 ext=11 ab=7 anon=562 file=80
end-load-10    rss=937 heapUsed=228 heapTotal=255 ext=36 ab=32 anon=858 file=80
load-25        rss=937 heapUsed=228 heapTotal=255 ext=36 ab=32 anon=858 file=80
end-load-25    rss=1119 heapUsed=550 heapTotal=584 ext=53 ab=50 anon=1039 file=80
load-50        rss=1119 heapUsed=550 heapTotal=584 ext=53 ab=50 anon=1039 file=80
end-load-50    rss=1182 heapUsed=219 heapTotal=643 ext=105 ab=102 anon=1103 file=80
cool-T0-c1     rss=1182 heapUsed=219 heapTotal=643 ext=105 ab=102 anon=1103 file=80
cool-T1-c1     rss=614 heapUsed=102 heapTotal=107 ext=5 ab=1 anon=534 file=80
cool-T5-c1     rss=615 heapUsed=101 heapTotal=107 ext=5 ab=1 anon=535 file=80
cool-T15-c1    rss=615 heapUsed=101 heapTotal=107 ext=5 ab=1 anon=535 file=80
gc-c1          rss=615 heapUsed=101 heapTotal=107 ext=5 ab=1 anon=535 file=80
snap-c1        rss=615 heapUsed=101 heapTotal=107 ext=5 ab=1 anon=535 file=80
load-50-cycle2 rss=615 heapUsed=101 heapTotal=107 ext=5 ab=1 anon=535 file=80
end-load-50-cycle2 rss=1249 heapUsed=450 heapTotal=659 ext=115 ab=43 anon=1169 file=80
cool-T0-c2     rss=1249 heapUsed=450 heapTotal=659 ext=115 ab=43 anon=1169 file=80
cool-T1-c2     rss=641 heapUsed=102 heapTotal=109 ext=5 ab=1 anon=562 file=80
snap-idle      rss=204 heapUsed=91 heapTotal=96 ext=5 ab=1 anon=126 file=79
before-gc      rss=615 heapUsed=101 heapTotal=107 ext=5 ab=1 anon=535 file=80
after-gc       rss=615 heapUsed=101 heapTotal=107 ext=5 ab=1 anon=535 file=80
snap-c1        rss=615 heapUsed=101 heapTotal=107 ext=5 ab=1 anon=535 file=80
