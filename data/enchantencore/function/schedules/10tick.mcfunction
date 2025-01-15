function enchantencore:crop_dance/reset_sneak_time
function enchantencore:seeker
function enchantencore:illumination/kill
function enchantencore:leaf_jumper/kill
execute as @a[scores={enchantencore.has_died=1..}] run function enchantencore:red_moon/has_died
execute as @a[scores={enchantencore.leaf_jumper=1..}] run scoreboard players set @s enchantencore.leaf_jumper 0

schedule function enchantencore:schedules/10tick 10t