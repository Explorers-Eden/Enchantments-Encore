schedule function enchantencore:10_tick_schedule 10t

execute as @a at @s if predicate enchantencore:entity/is_idle run scoreboard players add @s enchantencore.idle_time 1
execute as @a at @s unless predicate enchantencore:entity/is_idle run scoreboard players set @s enchantencore.idle_time 0

execute as @a unless score $datapack_info enchantencore.technical matches 1 run function enchantencore:first_time_msg