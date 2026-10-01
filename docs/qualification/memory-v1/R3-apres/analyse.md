| phase | durée s | RSS max | RSS fin | heapUsed max | heapTotal max | external max | arrayBuffers max | GC mineur n/ms | GC majeur n/ms | ELD p99 max ms | ELU moy | arbre RSS max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| idle | 60 | 246 | 221 | 96 | 126 | 5 | 1 | 1/1 | 3/24 | 52 | 0.00 | 246 |
| load-1 | 183 | 305 | 249 | 116 | 157 | 26 | 22 | 195/356 | 18/172 | 106 | 0.03 | 305 |
| load-10 | 185 | 583 | 583 | 370 | 400 | 47 | 41 | 414/2064 | 10/130 | 121 | 0.15 | 583 |
| load-25 | 187 | 744 | 704 | 479 | 511 | 73 | 69 | 866/5912 | 12/832 | 418 | 0.35 | 731 |
| load-50 | 187 | 1001 | 999 | 649 | 691 | 121 | 117 | 1319/12969 | 24/1574 | 707 | 0.67 | 999 |
| cool-T0-c1 | 60 | 999 | 363 | 573 | 635 | 100 | 96 | 0/0 | 2/159 | 29 | 0.01 | 999 |
| cool-T1-c1 | 240 | 364 | 364 | 99 | 106 | 5 | 1 | 4/4 | 0/0 | 45 | 0.00 | 364 |
| cool-T5-c1 | 600 | 364 | 356 | 99 | 105 | 5 | 1 | 9/8 | 0/0 | 15 | 0.00 | 364 |
| gc-c1 | 2 | 356 | 356 | 98 | 105 | 5 | 1 | 0/0 | 2/87 | 10 | 0.00 | 357 |

Points instantanés :
idle           rss=245 heapUsed=94 heapTotal=126 ext=5 ab=1 anon=165 file=81
load-1         rss=221 heapUsed=91 heapTotal=97 ext=5 ab=1 anon=140 file=81
end-load-1     rss=249 heapUsed=98 heapTotal=104 ext=6 ab=2 anon=167 file=82
load-10        rss=249 heapUsed=98 heapTotal=104 ext=6 ab=2 anon=167 file=82
end-load-10    rss=583 heapUsed=281 heapTotal=308 ext=36 ab=32 anon=501 file=82
load-25        rss=583 heapUsed=281 heapTotal=308 ext=36 ab=32 anon=501 file=82
end-load-25    rss=704 heapUsed=289 heapTotal=424 ext=37 ab=33 anon=622 file=82
load-50        rss=704 heapUsed=289 heapTotal=424 ext=37 ab=33 anon=622 file=82
end-load-50    rss=999 heapUsed=573 heapTotal=635 ext=100 ab=96 anon=917 file=82
cool-T0-c1     rss=999 heapUsed=573 heapTotal=635 ext=100 ab=96 anon=917 file=82
cool-T1-c1     rss=363 heapUsed=98 heapTotal=105 ext=5 ab=1 anon=281 file=82
cool-T5-c1     rss=364 heapUsed=98 heapTotal=105 ext=5 ab=1 anon=282 file=82
cool-T15-c1    rss=356 heapUsed=98 heapTotal=105 ext=5 ab=1 anon=275 file=82
gc-c1          rss=356 heapUsed=98 heapTotal=105 ext=5 ab=1 anon=275 file=82
stop           rss=356 heapUsed=98 heapTotal=105 ext=5 ab=1 anon=275 file=82
before-gc      rss=356 heapUsed=98 heapTotal=105 ext=5 ab=1 anon=275 file=82
after-gc       rss=356 heapUsed=98 heapTotal=105 ext=5 ab=1 anon=275 file=82
