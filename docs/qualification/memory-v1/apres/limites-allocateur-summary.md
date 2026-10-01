| run | req | req/s | p50 ms | p95 ms | Ko/réponse | RSS max | heapUsed max | heapTotal max | external max | arbre RSS max | RSS après GC | heapUsed après GC | anon après GC |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| limit-1024-defaut (cg max 943 Mo, failcnt 0, oom_kill_disable 0 oom_kill 0 , vivant=true) | 1106 | 6.1 | 2904 | 5130 | 899 | 1001 | 680 | 707 | 132 | 983 | 398 | 112 | 316 |
| limit-1024-intense-50 (cg max 1024 Mo, failcnt 0, oom_kill_disable 0 oom_kill 0 , vivant=true) | 1200 | 6.55 | 5361 | 10704 | 732 | 965 | 645 | 675 | 154 | 953 | 848 | 496 | 769 |
| limit-2048-defaut (cg max 1114 Mo, failcnt 0, oom_kill_disable 0 oom_kill 0 , vivant=true) | 1094 | 6.02 | 2753 | 5037 | 747 | 1110 | 708 | 806 | 132 | 1039 | 396 | 112 | 314 |
| limit-512-borne (cg max 512 Mo, failcnt 0, oom_kill_disable 0 oom_kill 1 , vivant=false) | 3330 | 18.43 | 1 | 4111 | 130 | 505 | 297 | 308 | 60 | 506 | 492 | 297 | 410 |
| limit-512-borne256-realiste-10 (cg max 292 Mo, failcnt 0, oom_kill_disable 0 oom_kill 0 , vivant=true) | 298 | 1.61 | 297 | 863 | 928 | 341 | 156 | 171 | 30 | 340 | 257 | 93 | 178 |
| limit-512-defaut (cg max 512 Mo, failcnt 0, oom_kill_disable 0 oom_kill 1 , vivant=false) | 6887 | 38.13 | 1 | 1 | 9 | 544 | 272 | 294 | 76 | 530 | 532 | 272 | 451 |
| limit-512-realiste-10 (cg max 512 Mo, failcnt 0, oom_kill_disable 0 oom_kill 1 , vivant=false) | 318 | 1.72 | 2 | 729 | 285 | 574 | 373 | 382 | 68 | 574 | 574 | 373 | 492 |
| limit-512-realiste-25 (cg max 512 Mo, failcnt 0, oom_kill_disable 0 oom_kill 1 , vivant=false) | 757 | 4.07 | 1 | 797 | 119 | 547 | 320 | 330 | 87 | 528 | 547 | 317 | 485 |
| alloc-arena2 | 1093 | 6.03 | 2777 | 4955 | 853 | 1108 | 696 | 753 | 145 | 1098 | 450 | 119 | 368 |
| alloc-glibc | 1194 | 6.58 | 2666 | 4343 | 842 | 1038 | 689 | 733 | 121 | 1034 | 501 | 165 | 419 |
| alloc-jemalloc | 1046 | 4.66 | 2945 | 5027 | 929 | 1118 | 681 | 752 | 162 | 1119 | 583 | 339 | 500 |
