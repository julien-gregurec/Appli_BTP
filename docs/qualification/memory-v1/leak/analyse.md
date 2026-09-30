| phase | durée s | RSS max | RSS fin | heapUsed max | heapTotal max | external max | arrayBuffers max | GC mineur n/ms | GC majeur n/ms | ELD p99 max ms | ELU moy | arbre RSS max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| idle | 60 | 233 | 203 | 94 | 125 | 5 | 1 | 2/8 | 2/20 | 11 | 0.00 | 233 |
| load-50 | 125 | 1046 | 1046 | 562 | 608 | 124 | 120 | 689/35776 | 29/1771 | 995 | 0.77 | 1002 |
| cool-T0-c1 | 60 | 1046 | 821 | 562 | 608 | 103 | 99 | 3/8 | 2/405 | 19 | 0.01 | 1047 |
| gc-c1 | 2 | 820 | 820 | 306 | 392 | 29 | 25 | 0/0 | 2/273 | 10 | 0.00 | 821 |
| load-50-cycle2 | 180 | 5535 | 5535 | 777 | 827 | 140 | 136 | 411/34813 | 18/1836 | 2027 | 0.52 | 5602 |
| cool-T0-c2 | 60 | 5346 | 5046 | 364 | 579 | 96 | 92 | 9/58 | 3/694 | 13 | 0.02 | 5346 |
| gc-c2 | 2 | 5046 | 5046 | 307 | 339 | 29 | 25 | 0/0 | 2/323 | 10 | 0.00 | 5046 |
| load-50-cycle3 | 127 | 5613 | 5407 | 658 | 703 | 149 | 145 | 473/39359 | 18/2447 | 1219 | 0.99 | 5614 |
| cool-T0-c3 | 60 | 5407 | 5407 | 512 | 652 | 123 | 119 | 0/0 | 0/0 | 11 | 0.00 | 5408 |
| gc-c3 | 2 | 5342 | 5342 | 309 | 338 | 29 | 25 | 0/0 | 2/345 | 10 | 0.01 | 5342 |
| load-50-cycle4 | 128 | 5608 | 5584 | 643 | 690 | 139 | 136 | 535/40068 | 20/2228 | 1323 | 0.99 | 5613 |
| cool-T0-c4 | 60 | 5604 | 5604 | 569 | 680 | 115 | 111 | 6/564 | 0/0 | 13 | 0.01 | 5604 |
| gc-c4 | 2 | 5260 | 5260 | 309 | 326 | 29 | 25 | 0/0 | 2/312 | 10 | 0.00 | 5260 |

Points instantanés :
idle           rss=225 heapUsed=98 heapTotal=118 ext=5 ab=1 anon=148 file=78
snap-idle      rss=203 heapUsed=91 heapTotal=97 ext=5 ab=1 anon=126 file=78
load-50        rss=203 heapUsed=91 heapTotal=96 ext=5 ab=1 anon=126 file=78
end-load-50    rss=1046 heapUsed=562 heapTotal=608 ext=103 ab=99 anon=967 file=79
cool-T0-c1     rss=1046 heapUsed=562 heapTotal=608 ext=103 ab=99 anon=967 file=79
cool-T1-c1     rss=821 heapUsed=306 heapTotal=392 ext=29 ab=25 anon=742 file=79
gc-c1          rss=821 heapUsed=306 heapTotal=392 ext=29 ab=25 anon=742 file=79
snap-c1        rss=820 heapUsed=306 heapTotal=392 ext=29 ab=25 anon=741 file=79
load-50-cycle2 rss=820 heapUsed=306 heapTotal=392 ext=29 ab=25 anon=741 file=79
end-load-50-cycle2 rss=5346 heapUsed=364 heapTotal=579 ext=96 ab=92 anon=5267 file=79
cool-T0-c2     rss=5346 heapUsed=364 heapTotal=579 ext=96 ab=92 anon=5267 file=79
cool-T1-c2     rss=5046 heapUsed=309 heapTotal=342 ext=29 ab=25 anon=4967 file=79
gc-c2          rss=5046 heapUsed=309 heapTotal=342 ext=29 ab=25 anon=4967 file=79
snap-c2        rss=5046 heapUsed=307 heapTotal=339 ext=29 ab=25 anon=4967 file=79
load-50-cycle3 rss=5046 heapUsed=307 heapTotal=339 ext=29 ab=25 anon=4967 file=79
end-load-50-cycle3 rss=5407 heapUsed=511 heapTotal=652 ext=123 ab=119 anon=5328 file=79
cool-T0-c3     rss=5407 heapUsed=511 heapTotal=652 ext=123 ab=119 anon=5328 file=79
cool-T1-c3     rss=5407 heapUsed=512 heapTotal=652 ext=123 ab=119 anon=5328 file=79
gc-c3          rss=5407 heapUsed=512 heapTotal=652 ext=123 ab=119 anon=5328 file=79
snap-c3        rss=5342 heapUsed=309 heapTotal=338 ext=29 ab=25 anon=5263 file=79
load-50-cycle4 rss=5342 heapUsed=308 heapTotal=334 ext=29 ab=25 anon=5263 file=79
end-load-50-cycle4 rss=5604 heapUsed=568 heapTotal=680 ext=115 ab=111 anon=5525 file=79
cool-T0-c4     rss=5604 heapUsed=568 heapTotal=680 ext=115 ab=111 anon=5525 file=79
cool-T1-c4     rss=5260 heapUsed=310 heapTotal=500 ext=29 ab=25 anon=5180 file=79
gc-c4          rss=5260 heapUsed=310 heapTotal=500 ext=29 ab=25 anon=5180 file=79
snap-c4        rss=5260 heapUsed=309 heapTotal=326 ext=29 ab=25 anon=5181 file=79
stop           rss=5260 heapUsed=309 heapTotal=327 ext=29 ab=25 anon=5181 file=79
snap-idle      rss=203 heapUsed=91 heapTotal=96 ext=5 ab=1 anon=126 file=78
before-gc      rss=821 heapUsed=306 heapTotal=392 ext=29 ab=25 anon=742 file=79
after-gc       rss=820 heapUsed=306 heapTotal=392 ext=29 ab=25 anon=741 file=79
snap-c1        rss=820 heapUsed=306 heapTotal=392 ext=29 ab=25 anon=741 file=79
before-gc      rss=5046 heapUsed=309 heapTotal=342 ext=29 ab=25 anon=4967 file=79
after-gc       rss=5046 heapUsed=307 heapTotal=339 ext=29 ab=25 anon=4967 file=79
snap-c2        rss=5046 heapUsed=307 heapTotal=339 ext=29 ab=25 anon=4967 file=79
before-gc      rss=5407 heapUsed=512 heapTotal=652 ext=123 ab=119 anon=5328 file=79
after-gc       rss=5342 heapUsed=309 heapTotal=338 ext=29 ab=25 anon=5263 file=79
snap-c3        rss=5342 heapUsed=308 heapTotal=334 ext=29 ab=25 anon=5263 file=79
before-gc      rss=5260 heapUsed=310 heapTotal=500 ext=29 ab=25 anon=5180 file=79
after-gc       rss=5260 heapUsed=309 heapTotal=326 ext=29 ab=25 anon=5181 file=79
snap-c4        rss=5260 heapUsed=309 heapTotal=327 ext=29 ab=25 anon=5181 file=79
