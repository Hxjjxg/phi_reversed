void __fastcall JudgeLineControl_CreateNote(__int64 klass, int i, char a3)
{
  long double v3; // q11
  __int64 klass_1; // x19
  __int64 v7; // x21
  __int64 v8; // x8
  __int64 i_1; // x24
  __int64 v10; // x21
  __int64 transform_4; // x22
  __int64 klass_2; // x21
  __int64 transform_196CEB0_4; // x22
  long double v14; // q0
  long double v15; // q1
  long double v16; // q2
  _QWORD *klass_3; // x22
  __int64 v18; // x23
  __int64 v19; // x8
  __int64 v20; // x8
  __int64 v21; // x25
  __int64 v22; // x21
  __int64 v23; // x8
  __int64 v24; // x21
  __int64 transform; // x22
  __int64 transform_196CEB0; // x22
  long double v27; // q0
  long double v28; // q1
  long double v29; // q2
  __int64 v30; // x23
  __int64 v31; // x8
  __int64 v32; // x23
  signed int klass_4; // w20
  unsigned int v34; // w23
  __int64 v35; // x8
  __int64 v36; // x24
  __int64 v37; // x8
  __int64 v38; // x9
  __int64 v39; // x23
  float v40; // s8
  __int64 v41; // x8
  float v42; // s9
  __int64 v43; // x8
  __int64 v44; // x23
  unsigned int v45; // w8
  __int64 v46; // x8
  __int64 v47; // x9
  __int64 v48; // x23
  float v49; // s8
  __int64 v50; // x8
  float v51; // s9
  __int64 v52; // x8
  __int64 *v53; // x8
  __int64 v54; // x21
  __int64 transform_6; // x22
  __int64 klass_13; // x21
  __int64 transform_196CEB0_6; // x22
  long double v58; // q0
  long double v59; // q1
  long double v60; // q2
  __int64 klass_14; // x21
  __int64 v62; // x22
  __int64 v63; // x8
  __int64 v64; // x23
  __int64 v65; // x22
  signed int klass_15; // w20
  unsigned int v67; // w22
  __int64 v68; // x8
  __int64 v69; // x23
  __int64 v70; // x8
  __int64 v71; // x9
  __int64 v72; // x22
  float v73; // s8
  __int64 v74; // x8
  float v75; // s9
  __int64 v76; // x8
  __int64 v77; // x22
  unsigned int v78; // w8
  __int64 v79; // x8
  __int64 v80; // x9
  __int64 v81; // x22
  float v82; // s8
  __int64 v83; // x8
  float v84; // s9
  __int64 v85; // x22
  __int64 v86; // x20
  __int64 v87; // x22
  __int64 v88; // x20
  __int64 v89; // x8
  int width_1A4BF50_6; // w20
  int v91; // w0
  int width_1A4BF50_7; // w20
  int v93; // w0
  float v94; // s0
  __int64 v95; // x21
  __int64 transform_2; // x22
  __int64 klass_6; // x21
  __int64 transform_196CEB0_2; // x22
  long double v99; // q0
  long double v100; // q1
  long double v101; // q2
  _QWORD *klass_7; // x22
  __int64 v103; // x23
  __int64 v104; // x8
  __int64 v105; // x26
  __int64 v106; // x23
  signed int klass_8; // w20
  unsigned int v108; // w23
  __int64 v109; // x8
  __int64 v110; // x24
  __int64 v111; // x8
  __int64 v112; // x9
  __int64 v113; // x23
  float v114; // s8
  __int64 v115; // x8
  float v116; // s9
  __int64 v117; // x8
  __int64 v118; // x23
  unsigned int v119; // w8
  __int64 v120; // x8
  __int64 v121; // x9
  __int64 v122; // x23
  float v123; // s8
  __int64 v124; // x8
  float v125; // s9
  __int64 v126; // x23
  __int64 v127; // x20
  __int64 v128; // x23
  __int64 v129; // x20
  __int64 v130; // x8
  int width_1A4BF50_2; // w20
  int v132; // w0
  float v133; // s8
  __int64 klass_9; // x20
  int width_1A4BF50_3; // w21
  __int64 v136; // x21
  __int64 transform_7; // x22
  __int64 transform_196CEB0_7; // x22
  long double v139; // q0
  long double v140; // q1
  long double v141; // q2
  __int64 v142; // x23
  __int64 v143; // x8
  __int64 v144; // x25
  __int64 v145; // x23
  signed int klass_16; // w20
  unsigned int v147; // w23
  __int64 v148; // x8
  __int64 v149; // x24
  __int64 v150; // x8
  __int64 v151; // x9
  __int64 v152; // x23
  float v153; // s8
  __int64 v154; // x8
  float v155; // s9
  __int64 v156; // x8
  __int64 v157; // x23
  unsigned int v158; // w8
  __int64 v159; // x8
  __int64 v160; // x9
  __int64 v161; // x23
  float v162; // s8
  __int64 v163; // x8
  float v164; // s9
  __int64 v165; // x8
  __int64 v166; // x21
  __int64 transform_3; // x22
  __int64 klass_10; // x21
  __int64 transform_196CEB0_3; // x22
  long double v170; // q0
  long double v171; // q1
  long double v172; // q2
  _QWORD *klass_11; // x22
  __int64 v174; // x23
  __int64 v175; // x8
  __int64 v176; // x25
  __int64 v177; // x23
  signed int klass_12; // w20
  unsigned int v179; // w23
  __int64 v180; // x8
  __int64 v181; // x24
  __int64 v182; // x8
  __int64 v183; // x9
  __int64 v184; // x23
  float v185; // s8
  __int64 v186; // x8
  float v187; // s9
  __int64 v188; // x8
  __int64 v189; // x23
  unsigned int v190; // w8
  __int64 v191; // x8
  __int64 v192; // x9
  __int64 v193; // x23
  float v194; // s8
  __int64 v195; // x8
  float v196; // s9
  __int64 v197; // x8
  long double localScale_1; // q8
  long double v199; // q1
  long double v200; // q9
  long double v201; // q2
  long double v202; // q10
  int width_1A4BF50_4; // w20
  int v204; // w0
  int width_1A4BF50_5; // w20
  float v206; // s11
  int v207; // w0
  int v208; // w19
  __int64 v209; // x21
  __int64 transform_5; // x22
  __int64 transform_196CEB0_5; // x22
  long double v212; // q0
  long double v213; // q1
  long double v214; // q2
  __int64 v215; // x23
  __int64 v216; // x8
  __int64 v217; // x25
  __int64 v218; // x21
  __int64 transform_1; // x22
  __int64 transform_196CEB0_1; // x22
  long double v221; // q0
  long double v222; // q1
  long double v223; // q2
  __int64 v224; // x23
  __int64 v225; // x23
  signed int klass_5; // w20
  unsigned int v227; // w23
  __int64 v228; // x8
  __int64 v229; // x24
  __int64 v230; // x8
  __int64 v231; // x9
  __int64 v232; // x23
  float v233; // s8
  __int64 v234; // x8
  float v235; // s9
  __int64 v236; // x8
  __int64 v237; // x23
  unsigned int v238; // w8
  __int64 v239; // x8
  __int64 v240; // x9
  __int64 v241; // x23
  float v242; // s8
  __int64 v243; // x8
  float v244; // s9
  __int64 v245; // x8
  long double localScale; // q8
  long double v247; // q1
  long double v248; // q9
  long double v249; // q2
  long double v250; // q10
  int width_1A4BF50; // w20
  int v252; // w0
  int width_1A4BF50_1; // w20
  float v254; // s11
  int v255; // w0
  int v256; // w19
  float v257; // s8
  float v258; // s1
  float v259; // s9
  float v260; // s2
  float v261; // s10
  float v262; // s1
  float v263; // s2
  __int64 v264; // x0
  __int64 v265; // x0
  __int64 v266; // x0
  __int64 v267; // x0
  int v268[2]; // [xsp+0h] [xbp-70h] BYREF
  char v269[4]; // [xsp+8h] [xbp-68h]

  klass_1 = klass; /*0x23973d0*/
  if ( (byte_4493E25 & 1) == 0 ) /*0x23973d4*/
  {
    JUMPOUT_w(); /*0x23973e4*/
    byte_4493E25 = 1; /*0x23973ec*/
  }
  if ( (a3 & 1) == 0 ) /*0x23973f0*/
  {
    v22 = *(_QWORD *)(klass_1 + 160); /*0x2397568*/
    if ( v22 ) /*0x239756c*/
    {
      if ( *(_DWORD *)(v22 + 24) <= (unsigned int)i ) /*0x2397578*/
        klass = System_ThrowArgumentOutOfRangeException_0x193646c(0); /*0x2397580*/
      v23 = *(_QWORD *)(*(_QWORD *)(v22 + 16) + 8LL * i + 32); /*0x239758c*/
      if ( v23 ) /*0x2397590*/
      {
        i_1 = i; /*0x23975b0*/
        switch ( *(_DWORD *)(v23 + 16) ) /*0x23975b8*/
        {
          case 1: /*0x23975b8*/
            v24 = *(_QWORD *)(klass_1 + 24); /*0x23975bc*/
            transform = UnityEngine_get_transform(klass_1, 0); /*0x23975d4*/
            if ( (*(_BYTE *)(::klass + 303) & 2) != 0 && !*(_DWORD *)(::klass + 224) ) /*0x23975e4*/
              j_il2cpp_runtime_class_init_0((void *)::klass); /*0x23975f0*/
            klass = sub_1EBFAE4(v24, transform, 1, qword_46C4F18); /*0x239760c*/
            if ( !klass ) /*0x2397610*/
              break; /*0x2397610*/
            klass_2 = klass; /*0x2397618*/
            transform_196CEB0 = UnityEngine_get_transform_196CEB0(klass, 0); /*0x2397628*/
            *(_DWORD *)v269 = 0; /*0x239763c*/
            *(_QWORD *)v268 = 0; /*0x2397640*/
            *(__n128 *)&v27 = sub_1C0226C(v268, 0, 1000.0, 0.0, 0.0); /*0x2397644*/
            if ( !transform_196CEB0 ) /*0x2397648*/
              break; /*0x2397648*/
            LODWORD(v27) = v268[0]; /*0x239764c*/
            LODWORD(v28) = v268[1]; /*0x239764c*/
            LODWORD(v29) = *(_DWORD *)v269; /*0x2397650*/
            UnityEngine_set_position_1A5847C(transform_196CEB0, 0, v27, v28, v29); /*0x239765c*/
            klass = sub_1EBF404(klass_2, qword_46C85B0); /*0x2397670*/
            if ( !klass ) /*0x2397674*/
              break; /*0x2397674*/
            klass_3 = (_QWORD *)klass; /*0x239767c*/
            *(_QWORD *)(klass + 40) = *(_QWORD *)(klass_1 + 96); /*0x2397680*/
            *(_QWORD *)(klass + 32) = *(_QWORD *)(klass_1 + 104); /*0x2397688*/
            *(_QWORD *)(klass + 24) = *(_QWORD *)(klass_1 + 112); /*0x2397690*/
            v30 = *(_QWORD *)(klass_1 + 160); /*0x2397694*/
            if ( !v30 ) /*0x2397698*/
              break; /*0x2397698*/
            if ( *(_DWORD *)(v30 + 24) <= (unsigned int)i ) /*0x23976a4*/
              klass = System_ThrowArgumentOutOfRangeException_0x193646c(0); /*0x23976ac*/
            v31 = *(_QWORD *)(*(_QWORD *)(v30 + 16) + 8LL * i + 32); /*0x23976b8*/
            klass_3[6] = klass_1; /*0x23976bc*/
            klass_3[7] = v31; /*0x23976bc*/
            if ( !*(_BYTE *)(klass_1 + 268) ) /*0x23976c4*/
              goto LABEL_73; /*0x23976c4*/
            v20 = *(_QWORD *)(klass_1 + 96); /*0x23976c8*/
            if ( !v20 ) /*0x23976cc*/
              break; /*0x23976cc*/
            v21 = *(_QWORD *)(klass_1 + 160); /*0x23976d0*/
            if ( !v21 ) /*0x23976d4*/
              break; /*0x23976d4*/
LABEL_39:
            v32 = *(_QWORD *)(v20 + 48); /*0x23976d8*/
            if ( *(_DWORD *)(v21 + 24) <= (unsigned int)i ) /*0x23976e4*/
              klass = System_ThrowArgumentOutOfRangeException_0x193646c(0); /*0x23976ec*/
            if ( !v32 ) /*0x23976f0*/
              break; /*0x23976f0*/
            klass = sub_3090C54(v32, *(_QWORD *)(*(_QWORD *)(v21 + 16) + 8 * i_1 + 32), qword_46CB378); /*0x2397710*/
            klass_4 = klass; /*0x2397714*/
            v34 = klass - 1; /*0x2397718*/
            if ( (int)klass < 1 ) /*0x239771c*/
              goto LABEL_57; /*0x239771c*/
            v35 = *(_QWORD *)(klass_1 + 96); /*0x2397720*/
            if ( !v35 ) /*0x2397724*/
              break; /*0x2397724*/
            v36 = *(_QWORD *)(v35 + 48); /*0x2397728*/
            if ( !v36 ) /*0x239772c*/
              break; /*0x239772c*/
            if ( *(_DWORD *)(v36 + 24) <= v34 ) /*0x2397738*/
              klass = System_ThrowArgumentOutOfRangeException_0x193646c(0); /*0x2397740*/
            v37 = *(_QWORD *)(*(_QWORD *)(v36 + 16) + 8LL * (int)v34 + 32); /*0x239774c*/
            if ( !v37 ) /*0x2397750*/
              break; /*0x2397750*/
            v38 = *(_QWORD *)(klass_1 + 96); /*0x2397754*/
            if ( !v38 ) /*0x2397758*/
              break; /*0x2397758*/
            v39 = *(_QWORD *)(v38 + 48); /*0x239775c*/
            if ( !v39 ) /*0x2397760*/
              break; /*0x2397760*/
            v40 = *(float *)(v37 + 44); /*0x2397768*/
            if ( *(_DWORD *)(v39 + 24) <= (unsigned int)klass_4 ) /*0x2397770*/
              klass = System_ThrowArgumentOutOfRangeException_0x193646c(0); /*0x2397778*/
            v41 = *(_QWORD *)(*(_QWORD *)(v39 + 16) + 8LL * klass_4 + 32); /*0x2397784*/
            if ( !v41 ) /*0x2397788*/
              break; /*0x2397788*/
            v42 = *(float *)(v41 + 44); /*0x2397794*/
            klass = klass_6; /*0x2397798*/
            if ( (*(_BYTE *)(klass_6 + 303) & 2) != 0 && !*(_DWORD *)(klass_6 + 224) ) /*0x23977a4*/
              j_il2cpp_runtime_class_init_0((void *)klass_6); /*0x23977ac*/
            if ( vabds_f32(v40, v42) <= 0.001 ) /*0x23977c0*/
              goto LABEL_72; /*0x23977c0*/
LABEL_57:
            v43 = *(_QWORD *)(klass_1 + 96); /*0x23977c4*/
            if ( !v43 ) /*0x23977c8*/
              break; /*0x23977c8*/
            v44 = *(_QWORD *)(v43 + 48); /*0x23977cc*/
            if ( !v44 ) /*0x23977d0*/
              break; /*0x23977d0*/
            v45 = *(_DWORD *)(v44 + 24); /*0x23977d4*/
            if ( klass_4 >= (int)(v45 - 1) ) /*0x23977e0*/
              goto LABEL_73; /*0x23977e0*/
            if ( v45 <= klass_4 + 1 ) /*0x23977ec*/
              klass = System_ThrowArgumentOutOfRangeException_0x193646c(0); /*0x23977f4*/
            v46 = *(_QWORD *)(*(_QWORD *)(v44 + 16) + 8LL * (klass_4 + 1) + 32); /*0x2397800*/
            if ( !v46 ) /*0x2397804*/
              break; /*0x2397804*/
            v47 = *(_QWORD *)(klass_1 + 96); /*0x2397808*/
            if ( !v47 ) /*0x239780c*/
              break; /*0x239780c*/
            v48 = *(_QWORD *)(v47 + 48); /*0x2397810*/
            if ( !v48 ) /*0x2397814*/
              break; /*0x2397814*/
            v49 = *(float *)(v46 + 44); /*0x239781c*/
            if ( *(_DWORD *)(v48 + 24) <= (unsigned int)klass_4 ) /*0x2397824*/
              klass = System_ThrowArgumentOutOfRangeException_0x193646c(0); /*0x239782c*/
            v50 = *(_QWORD *)(*(_QWORD *)(v48 + 16) + 8LL * klass_4 + 32); /*0x2397838*/
            if ( !v50 ) /*0x239783c*/
              break; /*0x239783c*/
            v51 = *(float *)(v50 + 44); /*0x2397848*/
            klass = klass_6; /*0x239784c*/
            if ( (*(_BYTE *)(klass_6 + 303) & 2) != 0 && !*(_DWORD *)(klass_6 + 224) ) /*0x2397858*/
              j_il2cpp_runtime_class_init_0((void *)klass_6); /*0x2397860*/
            if ( vabds_f32(v49, v51) < 0.001 ) /*0x2397874*/
LABEL_72:
              klass_3[9] = *(_QWORD *)(klass_1 + 56); /*0x2397878*/
LABEL_73:
            v52 = *(_QWORD *)(klass_1 + 288); /*0x2397880*/
            if ( !v52 ) /*0x2397884*/
              break; /*0x2397884*/
            klass = *(_QWORD *)(v52 + 48); /*0x2397888*/
            if ( !klass ) /*0x239788c*/
              break; /*0x239788c*/
            v53 = &qword_4709690; /*0x2397894*/
            goto LABEL_358; /*0x2397898*/
          case 2: /*0x23975b8*/
            v218 = *(_QWORD *)(klass_1 + 32); /*0x23987a8*/
            transform_1 = UnityEngine_get_transform(klass_1, 0); /*0x23987c0*/
            if ( (*(_BYTE *)(::klass + 303) & 2) != 0 && !*(_DWORD *)(::klass + 224) ) /*0x23987d0*/
              j_il2cpp_runtime_class_init_0((void *)::klass); /*0x23987dc*/
            klass = sub_1EBFAE4(v218, transform_1, 1, qword_46C4F18); /*0x23987f8*/
            if ( !klass ) /*0x23987fc*/
              break; /*0x23987fc*/
            klass_2 = klass; /*0x2398804*/
            transform_196CEB0_1 = UnityEngine_get_transform_196CEB0(klass, 0); /*0x2398814*/
            *(_DWORD *)v269 = 0; /*0x2398828*/
            *(_QWORD *)v268 = 0; /*0x239882c*/
            *(__n128 *)&v221 = sub_1C0226C(v268, 0, 1000.0, 0.0, 0.0); /*0x2398830*/
            if ( !transform_196CEB0_1 ) /*0x2398834*/
              break; /*0x2398834*/
            LODWORD(v221) = v268[0]; /*0x2398838*/
            LODWORD(v222) = v268[1]; /*0x2398838*/
            LODWORD(v223) = *(_DWORD *)v269; /*0x239883c*/
            UnityEngine_set_position_1A5847C(transform_196CEB0_1, 0, v221, v222, v223); /*0x2398848*/
            klass = sub_1EBF404(klass_2, qword_46FA130); /*0x239885c*/
            if ( !klass ) /*0x2398860*/
              break; /*0x2398860*/
            klass_3 = (_QWORD *)klass; /*0x2398868*/
            *(_QWORD *)(klass + 40) = *(_QWORD *)(klass_1 + 96); /*0x239886c*/
            *(_QWORD *)(klass + 32) = *(_QWORD *)(klass_1 + 104); /*0x2398874*/
            *(_QWORD *)(klass + 24) = *(_QWORD *)(klass_1 + 112); /*0x239887c*/
            v224 = *(_QWORD *)(klass_1 + 160); /*0x2398880*/
            if ( !v224 ) /*0x2398884*/
              break; /*0x2398884*/
            if ( *(_DWORD *)(v224 + 24) <= (unsigned int)i ) /*0x2398890*/
              klass = System_ThrowArgumentOutOfRangeException_0x193646c(0); /*0x2398898*/
            klass_3[6] = *(_QWORD *)(*(_QWORD *)(v224 + 16) + 8LL * i + 32); /*0x23988a8*/
            klass_3[7] = klass_1; /*0x23988a8*/
            if ( !*(_BYTE *)(klass_1 + 268) ) /*0x23988b0*/
              goto LABEL_355; /*0x23988b0*/
            v216 = *(_QWORD *)(klass_1 + 96); /*0x23988b4*/
            if ( !v216 ) /*0x23988b8*/
              break; /*0x23988b8*/
            v217 = *(_QWORD *)(klass_1 + 160); /*0x23988bc*/
            if ( !v217 ) /*0x23988c0*/
              break; /*0x23988c0*/
LABEL_321:
            v225 = *(_QWORD *)(v216 + 48); /*0x23988c4*/
            if ( *(_DWORD *)(v217 + 24) <= (unsigned int)i ) /*0x23988d0*/
              klass = System_ThrowArgumentOutOfRangeException_0x193646c(0); /*0x23988d8*/
            if ( !v225 ) /*0x23988dc*/
              break; /*0x23988dc*/
            klass = sub_3090C54(v225, *(_QWORD *)(*(_QWORD *)(v217 + 16) + 8 * i_1 + 32), qword_46CB378); /*0x23988fc*/
            klass_5 = klass; /*0x2398900*/
            v227 = klass - 1; /*0x2398904*/
            if ( (int)klass < 1 ) /*0x2398908*/
              goto LABEL_339; /*0x2398908*/
            v228 = *(_QWORD *)(klass_1 + 96); /*0x239890c*/
            if ( !v228 ) /*0x2398910*/
              break; /*0x2398910*/
            v229 = *(_QWORD *)(v228 + 48); /*0x2398914*/
            if ( !v229 ) /*0x2398918*/
              break; /*0x2398918*/
            if ( *(_DWORD *)(v229 + 24) <= v227 ) /*0x2398924*/
              klass = System_ThrowArgumentOutOfRangeException_0x193646c(0); /*0x239892c*/
            v230 = *(_QWORD *)(*(_QWORD *)(v229 + 16) + 8LL * (int)v227 + 32); /*0x2398938*/
            if ( !v230 ) /*0x239893c*/
              break; /*0x239893c*/
            v231 = *(_QWORD *)(klass_1 + 96); /*0x2398940*/
            if ( !v231 ) /*0x2398944*/
              break; /*0x2398944*/
            v232 = *(_QWORD *)(v231 + 48); /*0x2398948*/
            if ( !v232 ) /*0x239894c*/
              break; /*0x239894c*/
            v233 = *(float *)(v230 + 44); /*0x2398954*/
            if ( *(_DWORD *)(v232 + 24) <= (unsigned int)klass_5 ) /*0x239895c*/
              klass = System_ThrowArgumentOutOfRangeException_0x193646c(0); /*0x2398964*/
            v234 = *(_QWORD *)(*(_QWORD *)(v232 + 16) + 8LL * klass_5 + 32); /*0x2398970*/
            if ( !v234 ) /*0x2398974*/
              break; /*0x2398974*/
            v235 = *(float *)(v234 + 44); /*0x2398980*/
            klass = klass_6; /*0x2398984*/
            if ( (*(_BYTE *)(klass_6 + 303) & 2) != 0 && !*(_DWORD *)(klass_6 + 224) ) /*0x2398990*/
              j_il2cpp_runtime_class_init_0((void *)klass_6); /*0x2398998*/
            if ( vabds_f32(v233, v235) <= 0.001 ) /*0x23989ac*/
              goto LABEL_354; /*0x23989ac*/
LABEL_339:
            v236 = *(_QWORD *)(klass_1 + 96); /*0x23989b0*/
            if ( !v236 ) /*0x23989b4*/
              break; /*0x23989b4*/
            v237 = *(_QWORD *)(v236 + 48); /*0x23989b8*/
            if ( !v237 ) /*0x23989bc*/
              break; /*0x23989bc*/
            v238 = *(_DWORD *)(v237 + 24); /*0x23989c0*/
            if ( klass_5 >= (int)(v238 - 1) ) /*0x23989cc*/
              goto LABEL_355; /*0x23989cc*/
            if ( v238 <= klass_5 + 1 ) /*0x23989d8*/
              klass = System_ThrowArgumentOutOfRangeException_0x193646c(0); /*0x23989e0*/
            v239 = *(_QWORD *)(*(_QWORD *)(v237 + 16) + 8LL * (klass_5 + 1) + 32); /*0x23989ec*/
            if ( !v239 ) /*0x23989f0*/
              break; /*0x23989f0*/
            v240 = *(_QWORD *)(klass_1 + 96); /*0x23989f4*/
            if ( !v240 ) /*0x23989f8*/
              break; /*0x23989f8*/
            v241 = *(_QWORD *)(v240 + 48); /*0x23989fc*/
            if ( !v241 ) /*0x2398a00*/
              break; /*0x2398a00*/
            v242 = *(float *)(v239 + 44); /*0x2398a08*/
            if ( *(_DWORD *)(v241 + 24) <= (unsigned int)klass_5 ) /*0x2398a10*/
              klass = System_ThrowArgumentOutOfRangeException_0x193646c(0); /*0x2398a18*/
            v243 = *(_QWORD *)(*(_QWORD *)(v241 + 16) + 8LL * klass_5 + 32); /*0x2398a24*/
            if ( !v243 ) /*0x2398a28*/
              break; /*0x2398a28*/
            v244 = *(float *)(v243 + 44); /*0x2398a34*/
            klass = klass_6; /*0x2398a38*/
            if ( (*(_BYTE *)(klass_6 + 303) & 2) != 0 && !*(_DWORD *)(klass_6 + 224) ) /*0x2398a44*/
              j_il2cpp_runtime_class_init_0((void *)klass_6); /*0x2398a4c*/
            if ( vabds_f32(v242, v244) < 0.001 ) /*0x2398a60*/
LABEL_354:
              klass_3[9] = *(_QWORD *)(klass_1 + 80); /*0x2398a64*/
LABEL_355:
            v245 = *(_QWORD *)(klass_1 + 288); /*0x2398a6c*/
            if ( !v245 ) /*0x2398a70*/
              break; /*0x2398a70*/
            klass = *(_QWORD *)(v245 + 56); /*0x2398a74*/
            if ( !klass ) /*0x2398a78*/
              break; /*0x2398a78*/
            v53 = &qword_4701FF8; /*0x2398a80*/
LABEL_358:
            sub_308FE04(klass, klass_3, *v53); /*0x2398a84*/
            klass = UnityEngine_get_transform_196CEB0(klass_2, 0); /*0x2398a98*/
            if ( !klass ) /*0x2398a9c*/
              break; /*0x2398a9c*/
            localScale = UnityEngine_get_localScale(klass, 0); /*0x2398aac*/
            v248 = v247; /*0x2398ab0*/
            v250 = v249; /*0x2398ab4*/
            width_1A4BF50 = UnityEngine_get_width_1A4BF50(0); /*0x2398abc*/
            UnityEngine_get_height_1A4BF84(0); /*0x2398ac4*/
            if ( (float)((float)width_1A4BF50 / (float)v252) >= 1.7778 ) /*0x2398ae0*/
            {
              LODWORD(v3) = *(_DWORD *)(klass_1 + 264); /*0x2398b4c*/
              if ( (*(_BYTE *)(klass_5 + 303) & 2) != 0 && !*(_DWORD *)(klass_5 + 224) ) /*0x2398b5c*/
                j_il2cpp_runtime_class_init_0((void *)klass_5); /*0x2398b64*/
            }
            else
            {
              width_1A4BF50_1 = UnityEngine_get_width_1A4BF50(0); /*0x2398aec*/
              UnityEngine_get_height_1A4BF84(0); /*0x2398af4*/
              v254 = *(float *)(klass_1 + 264); /*0x2398b00*/
              v256 = v255; /*0x2398b04*/
              if ( (*(_BYTE *)(klass_5 + 303) & 2) != 0 && !*(_DWORD *)(klass_5 + 224) ) /*0x2398b14*/
                j_il2cpp_runtime_class_init_0((void *)klass_5); /*0x2398b20*/
              *(float *)&v3 = v254 * (float)((float)((float)width_1A4BF50_1 / (float)v256) / 1.7778); /*0x2398b3c*/
            }
            LODWORD(v257) = COERCE_UNSIGNED_INT128(UnityEngine_op_Multiply_1C03320(0, localScale, v248, v250, v3)); /*0x2398b88*/
            v259 = v258; /*0x2398b8c*/
            v261 = v260; /*0x2398b90*/
            klass = UnityEngine_get_transform_196CEB0(klass_2, 0); /*0x2398b94*/
            if ( !klass ) /*0x2398b98*/
              break; /*0x2398b98*/
LABEL_368:
            UnityEngine_set_localScale(klass, 0, v257, v259, v261); /*0x2398b9c*/
            return; /*0x2398bd0*/
          case 3: /*0x23975b8*/
            v95 = *(_QWORD *)(klass_1 + 40); /*0x2397c48*/
            transform_2 = UnityEngine_get_transform(klass_1, 0); /*0x2397c60*/
            if ( (*(_BYTE *)(::klass + 303) & 2) != 0 && !*(_DWORD *)(::klass + 224) ) /*0x2397c70*/
              j_il2cpp_runtime_class_init_0((void *)::klass); /*0x2397c7c*/
            klass = sub_1EBFAE4(v95, transform_2, 1, qword_46C4F18); /*0x2397c98*/
            if ( !klass ) /*0x2397c9c*/
              break; /*0x2397c9c*/
            klass_6 = klass; /*0x2397ca4*/
            transform_196CEB0_2 = UnityEngine_get_transform_196CEB0(klass, 0); /*0x2397cb4*/
            *(_DWORD *)v269 = 0; /*0x2397cc8*/
            *(_QWORD *)v268 = 0; /*0x2397ccc*/
            *(__n128 *)&v99 = sub_1C0226C(v268, 0, 1000.0, 0.0, 0.0); /*0x2397cd0*/
            if ( !transform_196CEB0_2 ) /*0x2397cd4*/
              break; /*0x2397cd4*/
            LODWORD(v99) = v268[0]; /*0x2397cd8*/
            LODWORD(v100) = v268[1]; /*0x2397cd8*/
            LODWORD(v101) = *(_DWORD *)v269; /*0x2397cdc*/
            UnityEngine_set_position_1A5847C(transform_196CEB0_2, 0, v99, v100, v101); /*0x2397ce8*/
            klass = sub_1EBF404(klass_6, qword_46B1978); /*0x2397cfc*/
            if ( !klass ) /*0x2397d00*/
              break; /*0x2397d00*/
            klass_7 = (_QWORD *)klass; /*0x2397d08*/
            *(_QWORD *)(klass + 40) = *(_QWORD *)(klass_1 + 96); /*0x2397d0c*/
            *(_QWORD *)(klass + 32) = *(_QWORD *)(klass_1 + 104); /*0x2397d14*/
            *(_QWORD *)(klass + 24) = *(_QWORD *)(klass_1 + 112); /*0x2397d1c*/
            v103 = *(_QWORD *)(klass_1 + 160); /*0x2397d20*/
            if ( !v103 ) /*0x2397d24*/
              break; /*0x2397d24*/
            if ( *(_DWORD *)(v103 + 24) <= (unsigned int)i ) /*0x2397d30*/
              klass = System_ThrowArgumentOutOfRangeException_0x193646c(0); /*0x2397d38*/
            klass_7[6] = *(_QWORD *)(*(_QWORD *)(v103 + 16) + 8LL * i + 32); /*0x2397d48*/
            klass_7[7] = klass_1; /*0x2397d48*/
            if ( !*(_BYTE *)(klass_1 + 268) ) /*0x2397d50*/
              goto LABEL_188; /*0x2397d50*/
            v104 = *(_QWORD *)(klass_1 + 96); /*0x2397d54*/
            if ( !v104 ) /*0x2397d58*/
              goto LABEL_377; /*0x2397d58*/
            v105 = *(_QWORD *)(klass_1 + 160); /*0x2397d5c*/
            if ( !v105 ) /*0x2397d60*/
              goto LABEL_377; /*0x2397d60*/
            v106 = *(_QWORD *)(v104 + 48); /*0x2397d68*/
            if ( *(_DWORD *)(v105 + 24) <= (unsigned int)i ) /*0x2397d70*/
              klass = System_ThrowArgumentOutOfRangeException_0x193646c(0); /*0x2397d78*/
            if ( !v106 ) /*0x2397d7c*/
              goto LABEL_377; /*0x2397d7c*/
            klass = sub_3090C54(v106, *(_QWORD *)(*(_QWORD *)(v105 + 16) + 8LL * i + 32), qword_46CB378); /*0x2397d9c*/
            klass_8 = klass; /*0x2397da0*/
            v108 = klass - 1; /*0x2397da4*/
            if ( (int)klass < 1 ) /*0x2397da8*/
              goto LABEL_164; /*0x2397da8*/
            v109 = *(_QWORD *)(klass_1 + 96); /*0x2397dac*/
            if ( !v109 ) /*0x2397db0*/
              goto LABEL_377; /*0x2397db0*/
            v110 = *(_QWORD *)(v109 + 48); /*0x2397db4*/
            if ( !v110 ) /*0x2397db8*/
              goto LABEL_377; /*0x2397db8*/
            if ( *(_DWORD *)(v110 + 24) <= v108 ) /*0x2397dc4*/
              klass = System_ThrowArgumentOutOfRangeException_0x193646c(0); /*0x2397dcc*/
            v111 = *(_QWORD *)(*(_QWORD *)(v110 + 16) + 8LL * (int)v108 + 32); /*0x2397dd8*/
            if ( !v111 ) /*0x2397ddc*/
              goto LABEL_377; /*0x2397ddc*/
            v112 = *(_QWORD *)(klass_1 + 96); /*0x2397de0*/
            if ( !v112 ) /*0x2397de4*/
              goto LABEL_377; /*0x2397de4*/
            v113 = *(_QWORD *)(v112 + 48); /*0x2397de8*/
            if ( !v113 ) /*0x2397dec*/
              goto LABEL_377; /*0x2397dec*/
            v114 = *(float *)(v111 + 44); /*0x2397df4*/
            if ( *(_DWORD *)(v113 + 24) <= (unsigned int)klass_8 ) /*0x2397dfc*/
              klass = System_ThrowArgumentOutOfRangeException_0x193646c(0); /*0x2397e04*/
            v115 = *(_QWORD *)(*(_QWORD *)(v113 + 16) + 8LL * klass_8 + 32); /*0x2397e10*/
            if ( !v115 ) /*0x2397e14*/
              goto LABEL_377; /*0x2397e14*/
            v116 = *(float *)(v115 + 44); /*0x2397e20*/
            klass = klass_6; /*0x2397e24*/
            if ( (*(_BYTE *)(klass_6 + 303) & 2) != 0 && !*(_DWORD *)(klass_6 + 224) ) /*0x2397e30*/
              j_il2cpp_runtime_class_init_0((void *)klass_6); /*0x2397e38*/
            if ( vabds_f32(v114, v116) <= 0.001 ) /*0x2397e4c*/
              goto LABEL_179; /*0x2397e4c*/
LABEL_164:
            v117 = *(_QWORD *)(klass_1 + 96); /*0x2397e50*/
            if ( !v117 ) /*0x2397e54*/
              goto LABEL_377; /*0x2397e54*/
            v118 = *(_QWORD *)(v117 + 48); /*0x2397e58*/
            if ( !v118 ) /*0x2397e5c*/
              goto LABEL_377; /*0x2397e5c*/
            v119 = *(_DWORD *)(v118 + 24); /*0x2397e60*/
            if ( klass_8 >= (int)(v119 - 1) ) /*0x2397e6c*/
              goto LABEL_188; /*0x2397e6c*/
            if ( v119 <= klass_8 + 1 ) /*0x2397e78*/
              klass = System_ThrowArgumentOutOfRangeException_0x193646c(0); /*0x2397e80*/
            v120 = *(_QWORD *)(*(_QWORD *)(v118 + 16) + 8LL * (klass_8 + 1) + 32); /*0x2397e8c*/
            if ( !v120 ) /*0x2397e90*/
              goto LABEL_377; /*0x2397e90*/
            v121 = *(_QWORD *)(klass_1 + 96); /*0x2397e94*/
            if ( !v121 ) /*0x2397e98*/
              goto LABEL_377; /*0x2397e98*/
            v122 = *(_QWORD *)(v121 + 48); /*0x2397e9c*/
            if ( !v122 ) /*0x2397ea0*/
              goto LABEL_377; /*0x2397ea0*/
            v123 = *(float *)(v120 + 44); /*0x2397ea8*/
            if ( *(_DWORD *)(v122 + 24) <= (unsigned int)klass_8 ) /*0x2397eb0*/
              klass = System_ThrowArgumentOutOfRangeException_0x193646c(0); /*0x2397eb8*/
            v124 = *(_QWORD *)(*(_QWORD *)(v122 + 16) + 8LL * klass_8 + 32); /*0x2397ec4*/
            if ( !v124 ) /*0x2397ec8*/
              goto LABEL_377; /*0x2397ec8*/
            v125 = *(float *)(v124 + 44); /*0x2397ed4*/
            klass = klass_6; /*0x2397ed8*/
            if ( (*(_BYTE *)(klass_6 + 303) & 2) != 0 && !*(_DWORD *)(klass_6 + 224) ) /*0x2397ee4*/
              j_il2cpp_runtime_class_init_0((void *)klass_6); /*0x2397eec*/
            if ( vabds_f32(v123, v125) >= 0.001 ) /*0x2397f00*/
              goto LABEL_188; /*0x2397f00*/
LABEL_179:
            v126 = klass_7[9]; /*0x2397f04*/
            if ( !v126 ) /*0x2397f08*/
              goto LABEL_377; /*0x2397f08*/
            v127 = *(_QWORD *)(klass_1 + 64); /*0x2397f0c*/
            if ( v127 ) /*0x2397f10*/
            {
              klass = sub_11C0054(*(_QWORD *)(klass_1 + 64), *(_QWORD *)(*(_QWORD *)v126 + 64LL)); /*0x2397f20*/
              if ( !klass ) /*0x2397f24*/
                goto LABEL_382; /*0x2397f24*/
            }
            if ( !*(_DWORD *)(v126 + 24) ) /*0x2397f2c*/
              goto LABEL_380; /*0x2397f2c*/
            *(_QWORD *)(v126 + 32) = v127; /*0x2397f30*/
            v128 = klass_7[9]; /*0x2397f34*/
            if ( !v128 ) /*0x2397f38*/
              goto LABEL_377; /*0x2397f38*/
            v129 = *(_QWORD *)(klass_1 + 72); /*0x2397f3c*/
            if ( v129 ) /*0x2397f40*/
            {
              klass = sub_11C0054(*(_QWORD *)(klass_1 + 72), *(_QWORD *)(*(_QWORD *)v128 + 64LL)); /*0x2397f50*/
              if ( !klass ) /*0x2397f54*/
              {
LABEL_382:
                v267 = sub_11C008C(); /*0x2398c74*/
                sub_11C0038(v267, 0); /*0x2398c7c*/
              }
            }
            if ( *(_DWORD *)(v128 + 24) <= 1u ) /*0x2397f60*/
            {
LABEL_380:
              v265 = sub_11C009C(klass); /*0x2398c5c*/
              sub_11C0038(v265, 0); /*0x2398c64*/
            }
            *(_QWORD *)(v128 + 40) = v129; /*0x2397f64*/
LABEL_188:
            v130 = *(_QWORD *)(klass_1 + 288); /*0x2397f68*/
            if ( !v130 ) /*0x2397f6c*/
              goto LABEL_377; /*0x2397f6c*/
            klass = *(_QWORD *)(v130 + 64); /*0x2397f70*/
            if ( !klass ) /*0x2397f74*/
              goto LABEL_377; /*0x2397f74*/
            sub_308FE04(klass, klass_7, qword_46BD5F8); /*0x2397f88*/
            width_1A4BF50_2 = UnityEngine_get_width_1A4BF50(0); /*0x2397f94*/
            UnityEngine_get_height_1A4BF84(0); /*0x2397f9c*/
            v133 = (float)width_1A4BF50_2 / (float)v132; /*0x2397fb0*/
            klass = sub_1EBF404(klass_6, qword_46B1978); /*0x2397fb4*/
            klass_9 = klass; /*0x2397fc0*/
            if ( v133 >= 1.7778 ) /*0x2397fc8*/
            {
              if ( klass ) /*0x2398be0*/
              {
                *(_DWORD *)(klass + 88) = *(_DWORD *)(klass_1 + 264); /*0x2398be8*/
                return; /*0x2398bec*/
              }
            }
            else
            {
              width_1A4BF50_3 = UnityEngine_get_width_1A4BF50(0); /*0x2397fd4*/
              UnityEngine_get_height_1A4BF84(0); /*0x2397fdc*/
              if ( klass_9 ) /*0x2397fe0*/
              {
                *(float *)(klass_9 + 88) = (float)((float)((float)width_1A4BF50_3 / (float)(int)klass) / 1.7778) /*0x2398004*/
                                         * *(float *)(klass_1 + 264);
                return; /*0x2398008*/
              }
            }
LABEL_377:
            sub_11C006C(klass); /*0x2398c48*/
          case 4: /*0x23975b8*/
            v166 = *(_QWORD *)(klass_1 + 48); /*0x23982ec*/
            transform_3 = UnityEngine_get_transform(klass_1, 0); /*0x2398304*/
            if ( (*(_BYTE *)(::klass + 303) & 2) != 0 && !*(_DWORD *)(::klass + 224) ) /*0x2398314*/
              j_il2cpp_runtime_class_init_0((void *)::klass); /*0x2398320*/
            klass = sub_1EBFAE4(v166, transform_3, 1, qword_46C4F18); /*0x239833c*/
            if ( !klass ) /*0x2398340*/
              goto LABEL_377; /*0x2398340*/
            klass_10 = klass; /*0x2398348*/
            transform_196CEB0_3 = UnityEngine_get_transform_196CEB0(klass, 0); /*0x2398358*/
            *(_DWORD *)v269 = 0; /*0x239836c*/
            *(_QWORD *)v268 = 0; /*0x2398370*/
            *(__n128 *)&v170 = sub_1C0226C(v268, 0, 1000.0, 0.0, 0.0); /*0x2398374*/
            if ( !transform_196CEB0_3 ) /*0x2398378*/
              goto LABEL_377; /*0x2398378*/
            LODWORD(v170) = v268[0]; /*0x239837c*/
            LODWORD(v171) = v268[1]; /*0x239837c*/
            LODWORD(v172) = *(_DWORD *)v269; /*0x2398380*/
            UnityEngine_set_position_1A5847C(transform_196CEB0_3, 0, v170, v171, v172); /*0x239838c*/
            klass = sub_1EBF404(klass_10, qword_46D09B8); /*0x23983a0*/
            if ( !klass ) /*0x23983a4*/
              goto LABEL_377; /*0x23983a4*/
            klass_11 = (_QWORD *)klass; /*0x23983ac*/
            *(_QWORD *)(klass + 40) = *(_QWORD *)(klass_1 + 96); /*0x23983b0*/
            *(_QWORD *)(klass + 32) = *(_QWORD *)(klass_1 + 104); /*0x23983b8*/
            *(_QWORD *)(klass + 24) = *(_QWORD *)(klass_1 + 112); /*0x23983c0*/
            v174 = *(_QWORD *)(klass_1 + 160); /*0x23983c4*/
            if ( !v174 ) /*0x23983c8*/
              goto LABEL_377; /*0x23983c8*/
            if ( *(_DWORD *)(v174 + 24) <= (unsigned int)i ) /*0x23983d4*/
              klass = System_ThrowArgumentOutOfRangeException_0x193646c(0); /*0x23983dc*/
            klass_11[6] = *(_QWORD *)(*(_QWORD *)(v174 + 16) + 8LL * i + 32); /*0x23983ec*/
            klass_11[7] = klass_1; /*0x23983ec*/
            if ( !*(_BYTE *)(klass_1 + 268) ) /*0x23983f4*/
              goto LABEL_288; /*0x23983f4*/
            v175 = *(_QWORD *)(klass_1 + 96); /*0x23983f8*/
            if ( !v175 ) /*0x23983fc*/
              goto LABEL_377; /*0x23983fc*/
            v176 = *(_QWORD *)(klass_1 + 160); /*0x2398400*/
            if ( !v176 ) /*0x2398404*/
              goto LABEL_377; /*0x2398404*/
            v177 = *(_QWORD *)(v175 + 48); /*0x239840c*/
            if ( *(_DWORD *)(v176 + 24) <= (unsigned int)i ) /*0x2398414*/
              klass = System_ThrowArgumentOutOfRangeException_0x193646c(0); /*0x239841c*/
            if ( !v177 ) /*0x2398420*/
              goto LABEL_377; /*0x2398420*/
            klass = sub_3090C54(v177, *(_QWORD *)(*(_QWORD *)(v176 + 16) + 8LL * i + 32), qword_46CB378); /*0x2398440*/
            klass_12 = klass; /*0x2398444*/
            v179 = klass - 1; /*0x2398448*/
            if ( (int)klass < 1 ) /*0x239844c*/
              goto LABEL_272; /*0x239844c*/
            v180 = *(_QWORD *)(klass_1 + 96); /*0x2398450*/
            if ( !v180 ) /*0x2398454*/
              goto LABEL_377; /*0x2398454*/
            v181 = *(_QWORD *)(v180 + 48); /*0x2398458*/
            if ( !v181 ) /*0x239845c*/
              goto LABEL_377; /*0x239845c*/
            if ( *(_DWORD *)(v181 + 24) <= v179 ) /*0x2398468*/
              klass = System_ThrowArgumentOutOfRangeException_0x193646c(0); /*0x2398470*/
            v182 = *(_QWORD *)(*(_QWORD *)(v181 + 16) + 8LL * (int)v179 + 32); /*0x239847c*/
            if ( !v182 ) /*0x2398480*/
              goto LABEL_377; /*0x2398480*/
            v183 = *(_QWORD *)(klass_1 + 96); /*0x2398484*/
            if ( !v183 ) /*0x2398488*/
              goto LABEL_377; /*0x2398488*/
            v184 = *(_QWORD *)(v183 + 48); /*0x239848c*/
            if ( !v184 ) /*0x2398490*/
              goto LABEL_377; /*0x2398490*/
            v185 = *(float *)(v182 + 44); /*0x2398498*/
            if ( *(_DWORD *)(v184 + 24) <= (unsigned int)klass_12 ) /*0x23984a0*/
              klass = System_ThrowArgumentOutOfRangeException_0x193646c(0); /*0x23984a8*/
            v186 = *(_QWORD *)(*(_QWORD *)(v184 + 16) + 8LL * klass_12 + 32); /*0x23984b4*/
            if ( !v186 ) /*0x23984b8*/
              goto LABEL_377; /*0x23984b8*/
            v187 = *(float *)(v186 + 44); /*0x23984c4*/
            klass = klass_6; /*0x23984c8*/
            if ( (*(_BYTE *)(klass_6 + 303) & 2) != 0 && !*(_DWORD *)(klass_6 + 224) ) /*0x23984d4*/
              j_il2cpp_runtime_class_init_0((void *)klass_6); /*0x23984dc*/
            if ( vabds_f32(v185, v187) <= 0.001 ) /*0x23984f0*/
              goto LABEL_287; /*0x23984f0*/
LABEL_272:
            v188 = *(_QWORD *)(klass_1 + 96); /*0x23984f4*/
            if ( !v188 ) /*0x23984f8*/
              goto LABEL_377; /*0x23984f8*/
            v189 = *(_QWORD *)(v188 + 48); /*0x23984fc*/
            if ( !v189 ) /*0x2398500*/
              goto LABEL_377; /*0x2398500*/
            v190 = *(_DWORD *)(v189 + 24); /*0x2398504*/
            if ( klass_12 >= (int)(v190 - 1) ) /*0x2398510*/
              goto LABEL_288; /*0x2398510*/
            if ( v190 <= klass_12 + 1 ) /*0x239851c*/
              klass = System_ThrowArgumentOutOfRangeException_0x193646c(0); /*0x2398524*/
            v191 = *(_QWORD *)(*(_QWORD *)(v189 + 16) + 8LL * (klass_12 + 1) + 32); /*0x2398530*/
            if ( !v191 ) /*0x2398534*/
              goto LABEL_377; /*0x2398534*/
            v192 = *(_QWORD *)(klass_1 + 96); /*0x2398538*/
            if ( !v192 ) /*0x239853c*/
              goto LABEL_377; /*0x239853c*/
            v193 = *(_QWORD *)(v192 + 48); /*0x2398540*/
            if ( !v193 ) /*0x2398544*/
              goto LABEL_377; /*0x2398544*/
            v194 = *(float *)(v191 + 44); /*0x239854c*/
            if ( *(_DWORD *)(v193 + 24) <= (unsigned int)klass_12 ) /*0x2398554*/
              klass = System_ThrowArgumentOutOfRangeException_0x193646c(0); /*0x239855c*/
            v195 = *(_QWORD *)(*(_QWORD *)(v193 + 16) + 8LL * klass_12 + 32); /*0x2398568*/
            if ( !v195 ) /*0x239856c*/
              goto LABEL_377; /*0x239856c*/
            v196 = *(float *)(v195 + 44); /*0x2398578*/
            klass = klass_6; /*0x239857c*/
            if ( (*(_BYTE *)(klass_6 + 303) & 2) != 0 && !*(_DWORD *)(klass_6 + 224) ) /*0x2398588*/
              j_il2cpp_runtime_class_init_0((void *)klass_6); /*0x2398590*/
            if ( vabds_f32(v194, v196) < 0.001 ) /*0x23985a4*/
LABEL_287:
              klass_11[9] = *(_QWORD *)(klass_1 + 88); /*0x23985a8*/
LABEL_288:
            v197 = *(_QWORD *)(klass_1 + 288); /*0x23985b0*/
            if ( !v197 ) /*0x23985b4*/
              goto LABEL_377; /*0x23985b4*/
            klass = *(_QWORD *)(v197 + 72); /*0x23985b8*/
            if ( !klass ) /*0x23985bc*/
              goto LABEL_377; /*0x23985bc*/
            sub_308FE04(klass, klass_11, qword_46FEC48); /*0x23985d0*/
            klass = UnityEngine_get_transform_196CEB0(klass_10, 0); /*0x23985dc*/
            if ( !klass ) /*0x23985e0*/
              goto LABEL_377; /*0x23985e0*/
            localScale_1 = UnityEngine_get_localScale(klass, 0); /*0x23985f0*/
            v200 = v199; /*0x23985f4*/
            v202 = v201; /*0x23985f8*/
            width_1A4BF50_4 = UnityEngine_get_width_1A4BF50(0); /*0x2398600*/
            UnityEngine_get_height_1A4BF84(0); /*0x2398608*/
            if ( (float)((float)width_1A4BF50_4 / (float)v204) >= 1.7778 ) /*0x2398624*/
            {
              LODWORD(v3) = *(_DWORD *)(klass_1 + 264); /*0x2398bf8*/
              if ( (*(_BYTE *)(klass_5 + 303) & 2) != 0 && !*(_DWORD *)(klass_5 + 224) ) /*0x2398c08*/
                j_il2cpp_runtime_class_init_0((void *)klass_5); /*0x2398c10*/
            }
            else
            {
              width_1A4BF50_5 = UnityEngine_get_width_1A4BF50(0); /*0x2398630*/
              UnityEngine_get_height_1A4BF84(0); /*0x2398638*/
              v206 = *(float *)(klass_1 + 264); /*0x2398644*/
              v208 = v207; /*0x2398648*/
              if ( (*(_BYTE *)(klass_5 + 303) & 2) != 0 && !*(_DWORD *)(klass_5 + 224) ) /*0x2398658*/
                j_il2cpp_runtime_class_init_0((void *)klass_5); /*0x2398664*/
              *(float *)&v3 = v206 * (float)((float)((float)width_1A4BF50_5 / (float)v208) / 1.7778); /*0x2398680*/
            }
            LODWORD(v257) = COERCE_UNSIGNED_INT128(UnityEngine_op_Multiply_1C03320(0, localScale_1, v200, v202, v3)); /*0x2398c34*/
            v259 = v262; /*0x2398c38*/
            v261 = v263; /*0x2398c3c*/
            klass = UnityEngine_get_transform_196CEB0(klass_10, 0); /*0x2398c40*/
            if ( !klass ) /*0x2398c44*/
              goto LABEL_377; /*0x2398c44*/
            goto LABEL_368; /*0x2398c44*/
          default:
            return;
        }
      }
    }
LABEL_378:
    sub_11C006C(klass); /*0x2398c4c*/
  }
  v7 = *(_QWORD *)(klass_1 + 152); /*0x23973f4*/
  if ( !v7 ) /*0x23973f8*/
    goto LABEL_378; /*0x23973f8*/
  if ( *(_DWORD *)(v7 + 24) <= (unsigned int)i ) /*0x2397404*/
    klass = System_ThrowArgumentOutOfRangeException_0x193646c(0); /*0x239740c*/
  v8 = *(_QWORD *)(*(_QWORD *)(v7 + 16) + 8LL * i + 32); /*0x2397418*/
  if ( !v8 ) /*0x239741c*/
    goto LABEL_378; /*0x239741c*/
  i_1 = i; /*0x239743c*/
  switch ( *(_DWORD *)(v8 + 16) ) /*0x2397444*/
  {
    case 1: /*0x2397444*/
      v10 = *(_QWORD *)(klass_1 + 24); /*0x2397448*/
      transform_4 = UnityEngine_get_transform(klass_1, 0); /*0x2397460*/
      if ( (*(_BYTE *)(::klass + 303) & 2) != 0 && !*(_DWORD *)(::klass + 224) ) /*0x2397470*/
        j_il2cpp_runtime_class_init_0((void *)::klass); /*0x239747c*/
      klass = sub_1EBFAE4(v10, transform_4, 1, qword_46C4F18); /*0x2397498*/
      if ( !klass ) /*0x239749c*/
        goto LABEL_378; /*0x239749c*/
      klass_2 = klass; /*0x23974a4*/
      transform_196CEB0_4 = UnityEngine_get_transform_196CEB0(klass, 0); /*0x23974b4*/
      *(_DWORD *)v269 = 0; /*0x23974c8*/
      *(_QWORD *)v268 = 0; /*0x23974cc*/
      *(__n128 *)&v14 = sub_1C0226C(v268, 0, 1000.0, 0.0, 0.0); /*0x23974d0*/
      if ( !transform_196CEB0_4 ) /*0x23974d4*/
        goto LABEL_378; /*0x23974d4*/
      LODWORD(v14) = v268[0]; /*0x23974d8*/
      LODWORD(v15) = v268[1]; /*0x23974d8*/
      LODWORD(v16) = *(_DWORD *)v269; /*0x23974dc*/
      UnityEngine_set_position_1A5847C(transform_196CEB0_4, 0, v14, v15, v16); /*0x23974e8*/
      klass = sub_1EBF404(klass_2, qword_46C85B0); /*0x23974fc*/
      if ( !klass ) /*0x2397500*/
        goto LABEL_378; /*0x2397500*/
      klass_3 = (_QWORD *)klass; /*0x2397508*/
      *(_QWORD *)(klass + 40) = *(_QWORD *)(klass_1 + 96); /*0x239750c*/
      *(_QWORD *)(klass + 32) = *(_QWORD *)(klass_1 + 104); /*0x2397514*/
      *(_QWORD *)(klass + 24) = *(_QWORD *)(klass_1 + 112); /*0x239751c*/
      v18 = *(_QWORD *)(klass_1 + 152); /*0x2397520*/
      if ( !v18 ) /*0x2397524*/
        goto LABEL_378; /*0x2397524*/
      if ( *(_DWORD *)(v18 + 24) <= (unsigned int)i ) /*0x2397530*/
        klass = System_ThrowArgumentOutOfRangeException_0x193646c(0); /*0x2397538*/
      v19 = *(_QWORD *)(*(_QWORD *)(v18 + 16) + 8LL * i + 32); /*0x2397544*/
      klass_3[6] = klass_1; /*0x2397548*/
      klass_3[7] = v19; /*0x2397548*/
      if ( !*(_BYTE *)(klass_1 + 268) ) /*0x2397550*/
        goto LABEL_73; /*0x2397550*/
      v20 = *(_QWORD *)(klass_1 + 96); /*0x2397554*/
      if ( !v20 ) /*0x2397558*/
        goto LABEL_378; /*0x2397558*/
      v21 = *(_QWORD *)(klass_1 + 152); /*0x239755c*/
      if ( !v21 ) /*0x2397560*/
        goto LABEL_378; /*0x2397560*/
      goto LABEL_39; /*0x2397560*/
    case 2: /*0x2397444*/
      v209 = *(_QWORD *)(klass_1 + 32); /*0x2398688*/
      transform_5 = UnityEngine_get_transform(klass_1, 0); /*0x23986a0*/
      if ( (*(_BYTE *)(::klass + 303) & 2) != 0 && !*(_DWORD *)(::klass + 224) ) /*0x23986b0*/
        j_il2cpp_runtime_class_init_0((void *)::klass); /*0x23986bc*/
      klass = sub_1EBFAE4(v209, transform_5, 1, qword_46C4F18); /*0x23986d8*/
      if ( !klass ) /*0x23986dc*/
        goto LABEL_378; /*0x23986dc*/
      klass_2 = klass; /*0x23986e4*/
      transform_196CEB0_5 = UnityEngine_get_transform_196CEB0(klass, 0); /*0x23986f4*/
      *(_DWORD *)v269 = 0; /*0x2398708*/
      *(_QWORD *)v268 = 0; /*0x239870c*/
      *(__n128 *)&v212 = sub_1C0226C(v268, 0, 1000.0, 0.0, 0.0); /*0x2398710*/
      if ( !transform_196CEB0_5 ) /*0x2398714*/
        goto LABEL_378; /*0x2398714*/
      LODWORD(v212) = v268[0]; /*0x2398718*/
      LODWORD(v213) = v268[1]; /*0x2398718*/
      LODWORD(v214) = *(_DWORD *)v269; /*0x239871c*/
      UnityEngine_set_position_1A5847C(transform_196CEB0_5, 0, v212, v213, v214); /*0x2398728*/
      klass = sub_1EBF404(klass_2, qword_46FA130); /*0x239873c*/
      if ( !klass ) /*0x2398740*/
        goto LABEL_378; /*0x2398740*/
      klass_3 = (_QWORD *)klass; /*0x2398748*/
      *(_QWORD *)(klass + 40) = *(_QWORD *)(klass_1 + 96); /*0x239874c*/
      *(_QWORD *)(klass + 32) = *(_QWORD *)(klass_1 + 104); /*0x2398754*/
      *(_QWORD *)(klass + 24) = *(_QWORD *)(klass_1 + 112); /*0x239875c*/
      v215 = *(_QWORD *)(klass_1 + 152); /*0x2398760*/
      if ( !v215 ) /*0x2398764*/
        goto LABEL_378; /*0x2398764*/
      if ( *(_DWORD *)(v215 + 24) <= (unsigned int)i ) /*0x2398770*/
        klass = System_ThrowArgumentOutOfRangeException_0x193646c(0); /*0x2398778*/
      klass_3[6] = *(_QWORD *)(*(_QWORD *)(v215 + 16) + 8LL * i + 32); /*0x2398788*/
      klass_3[7] = klass_1; /*0x2398788*/
      if ( !*(_BYTE *)(klass_1 + 268) ) /*0x2398790*/
        goto LABEL_355; /*0x2398790*/
      v216 = *(_QWORD *)(klass_1 + 96); /*0x2398794*/
      if ( !v216 ) /*0x2398798*/
        goto LABEL_378; /*0x2398798*/
      v217 = *(_QWORD *)(klass_1 + 152); /*0x239879c*/
      if ( !v217 ) /*0x23987a0*/
        goto LABEL_378; /*0x23987a0*/
      goto LABEL_321; /*0x23987a0*/
    case 3: /*0x2397444*/
      v54 = *(_QWORD *)(klass_1 + 40); /*0x239789c*/
      transform_6 = UnityEngine_get_transform(klass_1, 0); /*0x23978b4*/
      if ( (*(_BYTE *)(::klass + 303) & 2) != 0 && !*(_DWORD *)(::klass + 224) ) /*0x23978c4*/
        j_il2cpp_runtime_class_init_0((void *)::klass); /*0x23978d0*/
      klass = sub_1EBFAE4(v54, transform_6, 1, qword_46C4F18); /*0x23978ec*/
      if ( !klass ) /*0x23978f0*/
        goto LABEL_378; /*0x23978f0*/
      klass_13 = klass; /*0x23978f8*/
      transform_196CEB0_6 = UnityEngine_get_transform_196CEB0(klass, 0); /*0x2397908*/
      *(_DWORD *)v269 = 0; /*0x239791c*/
      *(_QWORD *)v268 = 0; /*0x2397920*/
      *(__n128 *)&v58 = sub_1C0226C(v268, 0, 1000.0, 0.0, 0.0); /*0x2397924*/
      if ( !transform_196CEB0_6 ) /*0x2397928*/
        goto LABEL_378; /*0x2397928*/
      LODWORD(v58) = v268[0]; /*0x239792c*/
      LODWORD(v59) = v268[1]; /*0x239792c*/
      LODWORD(v60) = *(_DWORD *)v269; /*0x2397930*/
      UnityEngine_set_position_1A5847C(transform_196CEB0_6, 0, v58, v59, v60); /*0x239793c*/
      klass = sub_1EBF404(klass_13, qword_46B1978); /*0x2397950*/
      if ( !klass ) /*0x2397954*/
        goto LABEL_378; /*0x2397954*/
      klass_14 = klass; /*0x239795c*/
      *(_QWORD *)(klass + 40) = *(_QWORD *)(klass_1 + 96); /*0x2397960*/
      *(_QWORD *)(klass + 32) = *(_QWORD *)(klass_1 + 104); /*0x2397968*/
      *(_QWORD *)(klass + 24) = *(_QWORD *)(klass_1 + 112); /*0x2397970*/
      v62 = *(_QWORD *)(klass_1 + 152); /*0x2397974*/
      if ( !v62 ) /*0x2397978*/
        goto LABEL_378; /*0x2397978*/
      if ( *(_DWORD *)(v62 + 24) <= (unsigned int)i ) /*0x2397984*/
        klass = System_ThrowArgumentOutOfRangeException_0x193646c(0); /*0x239798c*/
      *(_QWORD *)(klass_14 + 48) = *(_QWORD *)(*(_QWORD *)(v62 + 16) + 8LL * i + 32); /*0x239799c*/
      *(_QWORD *)(klass_14 + 56) = klass_1; /*0x239799c*/
      if ( !*(_BYTE *)(klass_1 + 268) ) /*0x23979a4*/
        goto LABEL_130; /*0x23979a4*/
      v63 = *(_QWORD *)(klass_1 + 96); /*0x23979a8*/
      if ( !v63 ) /*0x23979ac*/
        goto LABEL_378; /*0x23979ac*/
      v64 = *(_QWORD *)(klass_1 + 152); /*0x23979b0*/
      if ( !v64 ) /*0x23979b4*/
        goto LABEL_378; /*0x23979b4*/
      v65 = *(_QWORD *)(v63 + 48); /*0x23979bc*/
      if ( *(_DWORD *)(v64 + 24) <= (unsigned int)i ) /*0x23979c4*/
        klass = System_ThrowArgumentOutOfRangeException_0x193646c(0); /*0x23979cc*/
      if ( !v65 ) /*0x23979d0*/
        goto LABEL_378; /*0x23979d0*/
      klass = sub_3090C54(v65, *(_QWORD *)(*(_QWORD *)(v64 + 16) + 8LL * i + 32), qword_46CB378); /*0x23979f0*/
      klass_15 = klass; /*0x23979f4*/
      v67 = klass - 1; /*0x23979f8*/
      if ( (int)klass < 1 ) /*0x23979fc*/
        goto LABEL_106; /*0x23979fc*/
      v68 = *(_QWORD *)(klass_1 + 96); /*0x2397a00*/
      if ( !v68 ) /*0x2397a04*/
        goto LABEL_378; /*0x2397a04*/
      v69 = *(_QWORD *)(v68 + 48); /*0x2397a08*/
      if ( !v69 ) /*0x2397a0c*/
        goto LABEL_378; /*0x2397a0c*/
      if ( *(_DWORD *)(v69 + 24) <= v67 ) /*0x2397a18*/
        klass = System_ThrowArgumentOutOfRangeException_0x193646c(0); /*0x2397a20*/
      v70 = *(_QWORD *)(*(_QWORD *)(v69 + 16) + 8LL * (int)v67 + 32); /*0x2397a2c*/
      if ( !v70 ) /*0x2397a30*/
        goto LABEL_378; /*0x2397a30*/
      v71 = *(_QWORD *)(klass_1 + 96); /*0x2397a34*/
      if ( !v71 ) /*0x2397a38*/
        goto LABEL_378; /*0x2397a38*/
      v72 = *(_QWORD *)(v71 + 48); /*0x2397a3c*/
      if ( !v72 ) /*0x2397a40*/
        goto LABEL_378; /*0x2397a40*/
      v73 = *(float *)(v70 + 44); /*0x2397a48*/
      if ( *(_DWORD *)(v72 + 24) <= (unsigned int)klass_15 ) /*0x2397a50*/
        klass = System_ThrowArgumentOutOfRangeException_0x193646c(0); /*0x2397a58*/
      v74 = *(_QWORD *)(*(_QWORD *)(v72 + 16) + 8LL * klass_15 + 32); /*0x2397a64*/
      if ( !v74 ) /*0x2397a68*/
        goto LABEL_378; /*0x2397a68*/
      v75 = *(float *)(v74 + 44); /*0x2397a74*/
      klass = klass_6; /*0x2397a78*/
      if ( (*(_BYTE *)(klass_6 + 303) & 2) != 0 && !*(_DWORD *)(klass_6 + 224) ) /*0x2397a84*/
        j_il2cpp_runtime_class_init_0((void *)klass_6); /*0x2397a8c*/
      if ( vabds_f32(v73, v75) <= 0.001 ) /*0x2397aa0*/
        goto LABEL_121; /*0x2397aa0*/
LABEL_106:
      v76 = *(_QWORD *)(klass_1 + 96); /*0x2397aa4*/
      if ( !v76 ) /*0x2397aa8*/
        goto LABEL_378; /*0x2397aa8*/
      v77 = *(_QWORD *)(v76 + 48); /*0x2397aac*/
      if ( !v77 ) /*0x2397ab0*/
        goto LABEL_378; /*0x2397ab0*/
      v78 = *(_DWORD *)(v77 + 24); /*0x2397ab4*/
      if ( klass_15 >= (int)(v78 - 1) ) /*0x2397ac0*/
        goto LABEL_130; /*0x2397ac0*/
      if ( v78 <= klass_15 + 1 ) /*0x2397acc*/
        klass = System_ThrowArgumentOutOfRangeException_0x193646c(0); /*0x2397ad4*/
      v79 = *(_QWORD *)(*(_QWORD *)(v77 + 16) + 8LL * (klass_15 + 1) + 32); /*0x2397ae0*/
      if ( !v79 ) /*0x2397ae4*/
        goto LABEL_378; /*0x2397ae4*/
      v80 = *(_QWORD *)(klass_1 + 96); /*0x2397ae8*/
      if ( !v80 ) /*0x2397aec*/
        goto LABEL_378; /*0x2397aec*/
      v81 = *(_QWORD *)(v80 + 48); /*0x2397af0*/
      if ( !v81 ) /*0x2397af4*/
        goto LABEL_378; /*0x2397af4*/
      v82 = *(float *)(v79 + 44); /*0x2397afc*/
      if ( *(_DWORD *)(v81 + 24) <= (unsigned int)klass_15 ) /*0x2397b04*/
        klass = System_ThrowArgumentOutOfRangeException_0x193646c(0); /*0x2397b0c*/
      v83 = *(_QWORD *)(*(_QWORD *)(v81 + 16) + 8LL * klass_15 + 32); /*0x2397b18*/
      if ( !v83 ) /*0x2397b1c*/
        goto LABEL_378; /*0x2397b1c*/
      v84 = *(float *)(v83 + 44); /*0x2397b28*/
      klass = klass_6; /*0x2397b2c*/
      if ( (*(_BYTE *)(klass_6 + 303) & 2) != 0 && !*(_DWORD *)(klass_6 + 224) ) /*0x2397b38*/
        j_il2cpp_runtime_class_init_0((void *)klass_6); /*0x2397b40*/
      if ( vabds_f32(v82, v84) >= 0.001 ) /*0x2397b54*/
        goto LABEL_130; /*0x2397b54*/
LABEL_121:
      v85 = *(_QWORD *)(klass_14 + 72); /*0x2397b58*/
      if ( !v85 ) /*0x2397b5c*/
        goto LABEL_378; /*0x2397b5c*/
      v86 = *(_QWORD *)(klass_1 + 64); /*0x2397b60*/
      if ( v86 ) /*0x2397b64*/
      {
        klass = sub_11C0054(*(_QWORD *)(klass_1 + 64), *(_QWORD *)(*(_QWORD *)v85 + 64LL)); /*0x2397b74*/
        if ( !klass ) /*0x2397b78*/
          goto LABEL_381; /*0x2397b78*/
      }
      if ( !*(_DWORD *)(v85 + 24) ) /*0x2397b80*/
        goto LABEL_379; /*0x2397b80*/
      *(_QWORD *)(v85 + 32) = v86; /*0x2397b84*/
      v87 = *(_QWORD *)(klass_14 + 72); /*0x2397b88*/
      if ( !v87 ) /*0x2397b8c*/
        goto LABEL_378; /*0x2397b8c*/
      v88 = *(_QWORD *)(klass_1 + 72); /*0x2397b90*/
      if ( v88 ) /*0x2397b94*/
      {
        klass = sub_11C0054(*(_QWORD *)(klass_1 + 72), *(_QWORD *)(*(_QWORD *)v87 + 64LL)); /*0x2397ba4*/
        if ( !klass ) /*0x2397ba8*/
        {
LABEL_381:
          v266 = sub_11C008C(); /*0x2398c68*/
          sub_11C0038(v266, 0); /*0x2398c70*/
        }
      }
      if ( *(_DWORD *)(v87 + 24) <= 1u ) /*0x2397bb4*/
      {
LABEL_379:
        v264 = sub_11C009C(klass); /*0x2398c50*/
        sub_11C0038(v264, 0); /*0x2398c58*/
      }
      *(_QWORD *)(v87 + 40) = v88; /*0x2397bb8*/
LABEL_130:
      v89 = *(_QWORD *)(klass_1 + 288); /*0x2397bbc*/
      if ( !v89 ) /*0x2397bc0*/
        goto LABEL_378; /*0x2397bc0*/
      klass = *(_QWORD *)(v89 + 64); /*0x2397bc4*/
      if ( !klass ) /*0x2397bc8*/
        goto LABEL_378; /*0x2397bc8*/
      sub_308FE04(klass, klass_14, qword_46BD5F8); /*0x2397bdc*/
      width_1A4BF50_6 = UnityEngine_get_width_1A4BF50(0); /*0x2397be8*/
      UnityEngine_get_height_1A4BF84(0); /*0x2397bf0*/
      if ( (float)((float)width_1A4BF50_6 / (float)v91) >= 1.7778 ) /*0x2397c0c*/
      {
        v94 = *(float *)(klass_1 + 264); /*0x2398bd4*/
      }
      else
      {
        width_1A4BF50_7 = UnityEngine_get_width_1A4BF50(0); /*0x2397c18*/
        UnityEngine_get_height_1A4BF84(0); /*0x2397c20*/
        v94 = *(float *)(klass_1 + 264) * (float)((float)((float)width_1A4BF50_7 / (float)v93) / 1.7778); /*0x2397c40*/
      }
      *(float *)(klass_14 + 88) = v94; /*0x2398bd8*/
      break; /*0x2398bdc*/
    case 4: /*0x2397444*/
      v136 = *(_QWORD *)(klass_1 + 48); /*0x239800c*/
      transform_7 = UnityEngine_get_transform(klass_1, 0); /*0x2398024*/
      if ( (*(_BYTE *)(::klass + 303) & 2) != 0 && !*(_DWORD *)(::klass + 224) ) /*0x2398034*/
        j_il2cpp_runtime_class_init_0((void *)::klass); /*0x2398040*/
      klass = sub_1EBFAE4(v136, transform_7, 1, qword_46C4F18); /*0x239805c*/
      if ( !klass ) /*0x2398060*/
        goto LABEL_378; /*0x2398060*/
      klass_2 = klass; /*0x2398068*/
      transform_196CEB0_7 = UnityEngine_get_transform_196CEB0(klass, 0); /*0x2398078*/
      *(_DWORD *)v269 = 0; /*0x239808c*/
      *(_QWORD *)v268 = 0; /*0x2398090*/
      *(__n128 *)&v139 = sub_1C0226C(v268, 0, 1000.0, 0.0, 0.0); /*0x2398094*/
      if ( !transform_196CEB0_7 ) /*0x2398098*/
        goto LABEL_378; /*0x2398098*/
      LODWORD(v139) = v268[0]; /*0x239809c*/
      LODWORD(v140) = v268[1]; /*0x239809c*/
      LODWORD(v141) = *(_DWORD *)v269; /*0x23980a0*/
      UnityEngine_set_position_1A5847C(transform_196CEB0_7, 0, v139, v140, v141); /*0x23980ac*/
      klass = sub_1EBF404(klass_2, qword_46D09B8); /*0x23980c0*/
      if ( !klass ) /*0x23980c4*/
        goto LABEL_378; /*0x23980c4*/
      klass_3 = (_QWORD *)klass; /*0x23980cc*/
      *(_QWORD *)(klass + 40) = *(_QWORD *)(klass_1 + 96); /*0x23980d0*/
      *(_QWORD *)(klass + 32) = *(_QWORD *)(klass_1 + 104); /*0x23980d8*/
      *(_QWORD *)(klass + 24) = *(_QWORD *)(klass_1 + 112); /*0x23980e0*/
      v142 = *(_QWORD *)(klass_1 + 152); /*0x23980e4*/
      if ( !v142 ) /*0x23980e8*/
        goto LABEL_378; /*0x23980e8*/
      if ( *(_DWORD *)(v142 + 24) <= (unsigned int)i ) /*0x23980f4*/
        klass = System_ThrowArgumentOutOfRangeException_0x193646c(0); /*0x23980fc*/
      klass_3[6] = *(_QWORD *)(*(_QWORD *)(v142 + 16) + 8LL * i + 32); /*0x239810c*/
      klass_3[7] = klass_1; /*0x239810c*/
      if ( !*(_BYTE *)(klass_1 + 268) ) /*0x2398114*/
        goto LABEL_239; /*0x2398114*/
      v143 = *(_QWORD *)(klass_1 + 96); /*0x2398118*/
      if ( !v143 ) /*0x239811c*/
        goto LABEL_378; /*0x239811c*/
      v144 = *(_QWORD *)(klass_1 + 152); /*0x2398120*/
      if ( !v144 ) /*0x2398124*/
        goto LABEL_378; /*0x2398124*/
      v145 = *(_QWORD *)(v143 + 48); /*0x239812c*/
      if ( *(_DWORD *)(v144 + 24) <= (unsigned int)i ) /*0x2398134*/
        klass = System_ThrowArgumentOutOfRangeException_0x193646c(0); /*0x239813c*/
      if ( !v145 ) /*0x2398140*/
        goto LABEL_378; /*0x2398140*/
      klass = sub_3090C54(v145, *(_QWORD *)(*(_QWORD *)(v144 + 16) + 8LL * i + 32), qword_46CB378); /*0x2398160*/
      klass_16 = klass; /*0x2398164*/
      v147 = klass - 1; /*0x2398168*/
      if ( (int)klass < 1 ) /*0x239816c*/
        goto LABEL_223; /*0x239816c*/
      v148 = *(_QWORD *)(klass_1 + 96); /*0x2398170*/
      if ( !v148 ) /*0x2398174*/
        goto LABEL_378; /*0x2398174*/
      v149 = *(_QWORD *)(v148 + 48); /*0x2398178*/
      if ( !v149 ) /*0x239817c*/
        goto LABEL_378; /*0x239817c*/
      if ( *(_DWORD *)(v149 + 24) <= v147 ) /*0x2398188*/
        klass = System_ThrowArgumentOutOfRangeException_0x193646c(0); /*0x2398190*/
      v150 = *(_QWORD *)(*(_QWORD *)(v149 + 16) + 8LL * (int)v147 + 32); /*0x239819c*/
      if ( !v150 ) /*0x23981a0*/
        goto LABEL_378; /*0x23981a0*/
      v151 = *(_QWORD *)(klass_1 + 96); /*0x23981a4*/
      if ( !v151 ) /*0x23981a8*/
        goto LABEL_378; /*0x23981a8*/
      v152 = *(_QWORD *)(v151 + 48); /*0x23981ac*/
      if ( !v152 ) /*0x23981b0*/
        goto LABEL_378; /*0x23981b0*/
      v153 = *(float *)(v150 + 44); /*0x23981b8*/
      if ( *(_DWORD *)(v152 + 24) <= (unsigned int)klass_16 ) /*0x23981c0*/
        klass = System_ThrowArgumentOutOfRangeException_0x193646c(0); /*0x23981c8*/
      v154 = *(_QWORD *)(*(_QWORD *)(v152 + 16) + 8LL * klass_16 + 32); /*0x23981d4*/
      if ( !v154 ) /*0x23981d8*/
        goto LABEL_378; /*0x23981d8*/
      v155 = *(float *)(v154 + 44); /*0x23981e4*/
      klass = klass_6; /*0x23981e8*/
      if ( (*(_BYTE *)(klass_6 + 303) & 2) != 0 && !*(_DWORD *)(klass_6 + 224) ) /*0x23981f4*/
        j_il2cpp_runtime_class_init_0((void *)klass_6); /*0x23981fc*/
      if ( vabds_f32(v153, v155) <= 0.001 ) /*0x2398210*/
        goto LABEL_238; /*0x2398210*/
LABEL_223:
      v156 = *(_QWORD *)(klass_1 + 96); /*0x2398214*/
      if ( !v156 ) /*0x2398218*/
        goto LABEL_378; /*0x2398218*/
      v157 = *(_QWORD *)(v156 + 48); /*0x239821c*/
      if ( !v157 ) /*0x2398220*/
        goto LABEL_378; /*0x2398220*/
      v158 = *(_DWORD *)(v157 + 24); /*0x2398224*/
      if ( klass_16 >= (int)(v158 - 1) ) /*0x2398230*/
        goto LABEL_239; /*0x2398230*/
      if ( v158 <= klass_16 + 1 ) /*0x239823c*/
        klass = System_ThrowArgumentOutOfRangeException_0x193646c(0); /*0x2398244*/
      v159 = *(_QWORD *)(*(_QWORD *)(v157 + 16) + 8LL * (klass_16 + 1) + 32); /*0x2398250*/
      if ( !v159 ) /*0x2398254*/
        goto LABEL_378; /*0x2398254*/
      v160 = *(_QWORD *)(klass_1 + 96); /*0x2398258*/
      if ( !v160 ) /*0x239825c*/
        goto LABEL_378; /*0x239825c*/
      v161 = *(_QWORD *)(v160 + 48); /*0x2398260*/
      if ( !v161 ) /*0x2398264*/
        goto LABEL_378; /*0x2398264*/
      v162 = *(float *)(v159 + 44); /*0x239826c*/
      if ( *(_DWORD *)(v161 + 24) <= (unsigned int)klass_16 ) /*0x2398274*/
        klass = System_ThrowArgumentOutOfRangeException_0x193646c(0); /*0x239827c*/
      v163 = *(_QWORD *)(*(_QWORD *)(v161 + 16) + 8LL * klass_16 + 32); /*0x2398288*/
      if ( !v163 ) /*0x239828c*/
        goto LABEL_378; /*0x239828c*/
      v164 = *(float *)(v163 + 44); /*0x2398298*/
      klass = klass_6; /*0x239829c*/
      if ( (*(_BYTE *)(klass_6 + 303) & 2) != 0 && !*(_DWORD *)(klass_6 + 224) ) /*0x23982a8*/
        j_il2cpp_runtime_class_init_0((void *)klass_6); /*0x23982b0*/
      if ( vabds_f32(v162, v164) < 0.001 ) /*0x23982c4*/
LABEL_238:
        klass_3[9] = *(_QWORD *)(klass_1 + 88); /*0x23982c8*/
LABEL_239:
      v165 = *(_QWORD *)(klass_1 + 288); /*0x23982d0*/
      if ( !v165 ) /*0x23982d4*/
        goto LABEL_378; /*0x23982d4*/
      klass = *(_QWORD *)(v165 + 72); /*0x23982d8*/
      if ( !klass ) /*0x23982dc*/
        goto LABEL_378; /*0x23982dc*/
      v53 = &qword_46FEC48; /*0x23982e4*/
      goto LABEL_358; /*0x23982e8*/
    default:
      return;
  }
}
