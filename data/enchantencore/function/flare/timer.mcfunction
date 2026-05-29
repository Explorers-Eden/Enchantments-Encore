schedule function enchantencore:flare/timer 1s

scoreboard players add @e[predicate=enchantencore:entity/is_flare_projectile] enchantencore.technical 1

execute as @e[type=#enchantencore:hard_projectiles,tag=ee.flare.1,scores={enchantencore.technical=1..}] at @s run function enchantencore:flare/get_data_1
execute as @e[type=#enchantencore:hard_projectiles,tag=ee.flare.2,scores={enchantencore.technical=2..}] at @s run function enchantencore:flare/get_data_2
execute as @e[type=#enchantencore:hard_projectiles,tag=ee.flare.3,scores={enchantencore.technical=3..}] at @s run function enchantencore:flare/get_data_3
execute as @e[type=#enchantencore:hard_projectiles,tag=ee.flare.4,scores={enchantencore.technical=4..}] at @s run function enchantencore:flare/get_data_4
execute as @e[type=#enchantencore:hard_projectiles,tag=ee.flare.5,scores={enchantencore.technical=5..}] at @s run function enchantencore:flare/get_data_5