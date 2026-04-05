import json
import sys

def change_speed(input_file, output_file, speed_multiplier):
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    data['offset'] /= speed_multiplier

    for judge_line in data['judgeLineList']:
        judge_line['bpm'] *= speed_multiplier

        for note in judge_line['notesAbove']:
            note['floorPosition'] /= speed_multiplier

        for note in judge_line['notesBelow']:
            note['floorPosition'] /= speed_multiplier

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4)

    print(f'Speed changed to {speed_multiplier}x, saved to {output_file}')

if __name__ == '__main__':
    if len(sys.argv) < 4:
        print('Usage: python speed_changer.py <input.json> <output.json> <speed>')
        print('Example: python speed_changer.py ez.txt.pretty.json ez_2x.json 2.0')
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2]
    speed = float(sys.argv[3])

    change_speed(input_file, output_file, speed)
