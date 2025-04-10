function enchantencore:crop_dance/reset_sneak_time
function enchantencore:seeker/init
function enchantencore:illumination/kill
function enchantencore:leaf_jumper/kill
function enchantencore:guard
execute as @a[scores={enchantencore.has_died=1..}] run function enchantencore:red_moon/has_died
execute as @a[scores={enchantencore.leaf_jumper=1..}] run scoreboard players set @s enchantencore.leaf_jumper 0

execute as @a[tag=!ee.red_moon_removed] run function enchantencore:remove_red_moon_attributes

execute as @a at @s if predicate enchantencore:entity/is_idle run scoreboard players add @s enchantencore.idle_time 1
execute as @a at @s unless predicate enchantencore:entity/is_idle run scoreboard players set @s enchantencore.idle_time 0

schedule function enchantencore:schedules/10_tick 10t