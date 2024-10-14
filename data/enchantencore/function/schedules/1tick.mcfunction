function enchantencore:arrow_trail/run
execute as @a[nbt={SleepTimer: 10s}] run function enchantencore:red_moon/has_slept

schedule function enchantencore:schedules/1tick 1t