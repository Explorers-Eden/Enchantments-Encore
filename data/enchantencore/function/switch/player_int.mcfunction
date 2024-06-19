execute as @s[type=!#enchantencore:non_living] run data modify storage enchantencore:player_loc posx set from entity @s Pos[0]
execute as @s[type=!#enchantencore:non_living] run data modify storage enchantencore:player_loc posy set from entity @s Pos[1]
execute as @s[type=!#enchantencore:non_living] run data modify storage enchantencore:player_loc posz set from entity @s Pos[2]

execute as @s[type=!#enchantencore:non_living] run function enchantencore:switch/player_tp_exec with storage enchantencore:hostile_loc
