schedule function enchantencore:strafe/timer 1s

execute as @a[tag=enchantencore.is_strafing] run scoreboard players add @s enchantencore.strafe.timer 1

execute as @a[tag=enchantencore.is_strafing] if score @s enchantencore.strafe.timer matches 3.. run tag @s remove enchantencore.is_strafing

execute as @a[tag=!enchantencore.is_strafing] if score @s enchantencore.strafe.timer matches 3.. run scoreboard players set @s enchantencore.strafe.timer 0
execute as @a[tag=!enchantencore.is_strafing] unless score @s enchantencore.strafe.timer matches 3.. run tag @s add enchantencore.not_strafing