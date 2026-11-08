#!/bin/bash
# run regression scripts one after another, keeping the tail of each output
for t in "$@"; do
  echo "=== $t"
  timeout 420 python3 $t > logs_$t.txt 2>&1
  echo "exit $?"
  tail -12 logs_$t.txt
done
