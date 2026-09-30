| phase | durée s | RSS max | RSS fin | heapUsed max | heapTotal max | external max | arrayBuffers max | GC mineur n/ms | GC majeur n/ms | ELD p99 max ms | ELU moy | arbre RSS max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| idle | 60 | 233 | 207 | 96 | 126 | 5 | 1 | 0/0 | 3/26 | 11 | 0.00 | 234 |
| load-1 | 184 | 766 | 615 | 319 | 347 | 65 | 61 | 122/3296 | 11/270 | 400 | 0.05 | 767 |
| load-10 | 188 | 882 | 877 | 380 | 412 | 76 | 72 | 572/19522 | 24/569 | 463 | 0.27 | 882 |
| load-25 | 188 | 963 | 950 | 461 | 491 | 94 | 90 | 1031/30419 | 35/1298 | 422 | 0.49 | 973 |
| load-50 | 189 | 1304 | 1298 | 730 | 782 | 132 | 128 | 1466/42409 | 36/1840 | 772 | 0.73 | 1298 |
| cool-T0-c1 | 60 | 1298 | 749 | 654 | 766 | 118 | 114 | 0/0 | 1/102 | 31 | 0.00 | 1298 |
| cool-T1-c1 | 240 | 750 | 750 | 105 | 515 | 5 | 1 | 3/11 | 0/0 | 11 | 0.00 | 750 |

Points instantanés :
idle           rss=232 heapUsed=94 heapTotal=126 ext=5 ab=1 anon=151 file=82
snap-idle      rss=207 heapUsed=91 heapTotal=96 ext=5 ab=1 anon=126 file=82
load-1         rss=207 heapUsed=90 heapTotal=96 ext=5 ab=1 anon=126 file=82
end-load-1     rss=615 heapUsed=166 heapTotal=195 ext=30 ab=26 anon=532 file=83
load-10        rss=615 heapUsed=166 heapTotal=195 ext=30 ab=26 anon=532 file=83
end-load-10    rss=877 heapUsed=352 heapTotal=391 ext=59 ab=55 anon=794 file=83
load-25        rss=877 heapUsed=352 heapTotal=391 ext=59 ab=55 anon=794 file=83
end-load-25    rss=950 heapUsed=368 heapTotal=410 ext=94 ab=90 anon=867 file=83
load-50        rss=950 heapUsed=368 heapTotal=410 ext=94 ab=90 anon=867 file=83
end-load-50    rss=1298 heapUsed=654 heapTotal=766 ext=118 ab=114 anon=1215 file=83
cool-T0-c1     rss=1298 heapUsed=654 heapTotal=766 ext=118 ab=114 anon=1215 file=83
cool-T1-c1     rss=749 heapUsed=104 heapTotal=514 ext=5 ab=1 anon=666 file=83
cool-T5-c1     rss=750 heapUsed=105 heapTotal=514 ext=5 ab=1 anon=667 file=83
snap-idle      rss=207 heapUsed=90 heapTotal=96 ext=5 ab=1 anon=126 file=82
